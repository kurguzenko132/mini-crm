import { NextResponse } from 'next/server';

type Body = {
  text?: string;
};

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { error: 'Telegram не настроен. Добавь TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в переменные окружения.' },
      { status: 400 },
    );
  }

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON.' }, { status: 400 });
  }

  const text = payload.text?.trim();
  if (!text) {
    return NextResponse.json({ error: 'Пустое сообщение.' }, { status: 400 });
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    const description = typeof data?.description === 'string' ? data.description : 'Не удалось отправить сообщение в Telegram.';
    return NextResponse.json({ error: description }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
