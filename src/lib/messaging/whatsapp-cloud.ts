import {
  whatsappCloudPhoneNumberId,
  whatsappCloudToken,
  messagingOwnerPhoneE164,
} from "@/lib/config/messaging";

export function whatsappCloudConfigured(): boolean {
  return Boolean(whatsappCloudToken() && whatsappCloudPhoneNumberId() && messagingOwnerPhoneE164());
}

/** Send draft text to owner via WhatsApp Cloud API (headless). */
export async function sendWhatsappCloudTextToOwner(body: string): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}> {
  const token = whatsappCloudToken();
  const phoneNumberId = whatsappCloudPhoneNumberId();
  const to = messagingOwnerPhoneE164();
  if (!token || !phoneNumberId || !to) {
    return { ok: false, error: "WhatsApp Cloud API is not configured in .env.local" };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "text",
      text: { body: body.slice(0, 4096) },
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: json.error?.message ?? `WhatsApp Cloud API failed (${res.status})`,
    };
  }

  return { ok: true, messageId: json.messages?.[0]?.id };
}
