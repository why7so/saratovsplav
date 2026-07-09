// supabase/functions/yookassa-webhook/index.ts
//
// Принимает HTTP-уведомления от ЮKassa о смене статуса платежа.
//
// ВАЖНО про безопасность: в отличие от Т-Кассы, уведомления ЮKassa НЕ подписаны
// (нет Token/подписи в теле). Поэтому нельзя доверять статусу из самого
// уведомления — иначе кто угодно, зная URL вебхука, мог бы прислать
// поддельный "payment.succeeded" и пометить любую заявку оплаченной.
// Вместо этого мы берём из уведомления только id платежа и САМИ запрашиваем
// его актуальный статус у ЮKassa через API (с нашим secret key) — это и есть
// источник истины.
//
// При деплое эта функция должна быть с отключённой проверкой JWT, т.к.
// ЮKassa не передаёт Supabase-авторизацию:
//   supabase functions deploy yookassa-webhook --no-verify-jwt
//
// Секреты: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const YOOKASSA_SHOP_ID = Deno.env.get("YOOKASSA_SHOP_ID")!;
const YOOKASSA_SECRET_KEY = Deno.env.get("YOOKASSA_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function basicAuthHeader(shopId: string, secretKey: string): string {
  return "Basic " + btoa(shopId + ":" + secretKey);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const paymentId = body?.object?.id;

    if (!paymentId) {
      return new Response("OK", { status: 200 }); // нечего обрабатывать, но подтверждаем получение
    }

    // Запрашиваем реальный статус платежа у ЮKassa своими ключами —
    // тело исходного уведомления не используем как источник истины.
    const ykRes = await fetch("https://api.yookassa.ru/v3/payments/" + paymentId, {
      headers: { "Authorization": basicAuthHeader(YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY) },
    });

    if (!ykRes.ok) {
      console.error("yookassa-webhook: не удалось проверить платёж", paymentId, ykRes.status);
      return new Response("ERROR", { status: 502 });
    }

    const payment = await ykRes.json();
    const bookingId = payment?.metadata?.booking_id;

    let paymentStatus: string | null = null;
    switch (payment.status) {
      case "succeeded":
        paymentStatus = "paid";
        break;
      case "canceled":
        paymentStatus = "failed";
        break;
      case "waiting_for_capture":
      case "pending":
        paymentStatus = "pending";
        break;
      default:
        paymentStatus = null;
    }

    if (bookingId && paymentStatus) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase
        .from("bookings")
        .update({ payment_status: paymentStatus, payment_id: payment.id })
        .eq("id", bookingId);

      if (error) {
        console.error("yookassa-webhook: не удалось обновить booking", error);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("yookassa-webhook error:", e);
    return new Response("ERROR", { status: 500 });
  }
});
