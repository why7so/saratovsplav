// supabase/functions/create-payment/index.ts
//
// Принимает данные заявки на бронирование с сайта, создаёт запись в таблице
// bookings (payment_status = 'pending') и создаёт платёж в ЮKassa, возвращая
// ссылку на страницу оплаты (confirmation_url).
//
// Секреты, которые нужно задать перед деплоем (supabase secrets set ...):
//   YOOKASSA_SHOP_ID    — идентификатор магазина в ЮKassa
//   YOOKASSA_SECRET_KEY — секретный ключ магазина
//   SITE_URL            — адрес сайта, напр. https://saratovsplav.dpdns.org

import { createClient } from "npm:@supabase/supabase-js@2";

const YOOKASSA_SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID")!;
const YOOKASSA_SECRET_KEY = Deno.env.get("YOOKASSA_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://saratovsplav.dpdns.org").replace(/\/$/, "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function basicAuthHeader(shopId: string, secretKey: string): string {
  return "Basic " + btoa(shopId + ":" + secretKey);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { name, phone, tour, trip_date, people, comment, schedule_id, amount } = body;

    if (!name || !phone || !tour) {
      return jsonResponse({ error: "Не заполнены обязательные поля" }, 400);
    }

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return jsonResponse({ error: "Некорректная сумма оплаты" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Создаём заявку со статусом "ожидает оплаты".
    // service-role клиент обходит RLS — это нормально, т.к. функция сама
    // валидирует входные данные.
    const { data: booking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        name,
        phone,
        tour,
        trip_date: trip_date || null,
        people: people || null,
        comment: comment || null,
        schedule_id: schedule_id || null,
        amount: amountNum,
        payment_status: "pending",
      })
      .select()
      .single();

    if (insertError || !booking) {
      return jsonResponse({ error: insertError?.message || "Не удалось создать заявку" }, 500);
    }

    // 2. Создаём платёж в ЮKassa.
    // return_url — куда вернётся браузер пользователя после оплаты
    // (неважно, успешно она прошла или нет — сама ЮKassa не различает
    // success/fail в самом редиректе, поэтому передаём booking_id и
    // проверяем реальный статус отдельным запросом на странице сайта).
    const returnUrl = SITE_URL + "/index.html?payment=return&booking=" + encodeURIComponent(booking.id);

    let ykData: any;
    try {
      const ykRes = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          "Authorization": basicAuthHeader(YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY),
          "Idempotence-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: { value: amountNum.toFixed(2), currency: "RUB" },
          capture: true,
          confirmation: { type: "redirect", return_url: returnUrl },
          description: ("Оплата тура: " + tour).slice(0, 128),
          metadata: { booking_id: String(booking.id) },
        }),
      });
      ykData = await ykRes.json();
    } catch (e) {
      await supabase.from("bookings").update({ payment_status: "failed" }).eq("id", booking.id);
      return jsonResponse({ error: "Не удалось связаться с ЮKassa: " + String(e) }, 502);
    }

    if (!ykData?.id || !ykData?.confirmation?.confirmation_url) {
      await supabase.from("bookings").update({ payment_status: "failed" }).eq("id", booking.id);
      return jsonResponse(
        { error: ykData?.description || "Не удалось создать платёж в ЮKassa" },
        502,
      );
    }

    await supabase
      .from("bookings")
      .update({ payment_id: ykData.id, payment_url: ykData.confirmation.confirmation_url })
      .eq("id", booking.id);

    return jsonResponse({ paymentUrl: ykData.confirmation.confirmation_url });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
