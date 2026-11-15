import { Webhook } from 'svix';
import { headers } from 'next/headers';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';

export async function POST(req: Request) {
  const signingSecret = process.env.CLERK_SIGNING_SECRET;

  if (!signingSecret) {
    return new Response('Error: Please add SIGNING_SECRET', { status: 500 });
  }

  const wh = new Webhook(signingSecret)

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing Svix headers.', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error: Could not verify webhook:', err)
    return new Response('Invalid webhook signature.', { status: 400 });
  }

 
 const EventType = event.type
 console.log('Received webhook with ID ${id} and event type of ${eventType}')
 console.log('Webhook payload:', body)
 
 if (EventType === "user.created"){
    const data = event.data
    await db.insert(users).values({
        // Todo: Add email login
        clerkId: data.id, 
        name: `${data.first_name} ${data.last_name}`,
        imageUrl: data.image_url,
    })
 }

 if (EventType === "user.deleted"){
    const data = event.data  

    if (!data.id){
        return new Response("Missing User Id from body", { status: 400})
    }


    await db.delete(users).where(eq(users.clerkId, data.id));
 }

 if (EventType === "user.updated"){
    const data = event.data
    await db.update(users)
    .set({
        name: `${data.first_name} ${data.last_name}`,
        imageUrl: data.image_url,
    }).where(eq(users.clerkId, data.id))
 }

 return new Response('Webhook received', { status: 200})
}
