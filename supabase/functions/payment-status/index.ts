// supabase/functions/payment-status/index.ts
//
// ЮKassa не различает "успех"/"неудача" в самом редиректе обратно на сайт —
// return_url один и тот же в обоих случаях. Поэтому после возврата клиент
// вызывает эту функцию с booking_id, чтобы узнать реальный статус оплаты.
//
// Отдаёт наружу только минимум данных (статус и сумму) — никаких ФИО/телефонов.
//
// Секреты: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const YOOKASSA_SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID")!;
const YOOKASSA_SECRET_KEY = Deno.env.get("YOOKASSA_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function basicAuthHeader(shopId: string, secretKey: string): string {
  return "Basic " + btoa(shopId + ":" + secretKey);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { booking_id } = await req.json();
    if (!booking_id) return jsonResponse({ error: "booking_id обязателен" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("payment_status, payment_id, amount")
      .eq("id", booking_id)
      .single();

    if (error || !booking) {
      return jsonResponse({ error: "Заявка не найдена" }, 404);
    }

    // Если по нашим данным платёж всё ещё "в ожидании" — возможно, вебхук
    // от ЮKassa ещё не долетел. Проверяем статус напрямую и на лету обновляем.
    if (booking.payment_status === "pending" && booking.payment_id) {
      try {
        const ykRes = await fetch("https://api.yookassa.ru/v3/payments/" + booking.payment_id, {
          headers: { "Authorization": basicAuthHeader(YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY) },
        });
        if (ykRes.ok) {
          const payment = await ykRes.json();
          let freshStatus: string | null = null;
          if (payment.status === "succeeded") freshStatus = "paid";
          else if (payment.status === "canceled") freshStatus = "failed";

          if (freshStatus && freshStatus !== booking.payment_status) {
            await supabase.from("bookings").update({ payment_status: freshStatus }).eq("id", booking_id);
            booking.payment_status = freshStatus;
          }
        }
      } catch (_e) {
        // Если проверка не удалась — просто вернём то, что знаем сами
      }
    }

    return jsonResponse({ status: booking.payment_status, amount: booking.amount });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
