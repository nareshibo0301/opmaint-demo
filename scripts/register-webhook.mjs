/**
 * Helper script to register the Calendly Webhook.
 * Usage: 
 * 1. Set CALENDLY_API_KEY in .env.local
 * 2. Set your public URL (e.g. Vercel URL) in the script or via env
 * 3. Run: node scripts/register-webhook.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from .env.local or .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const PAT = process.env.CALENDLY_API_KEY;
// IMPORTANT: Replace this with your actual deployed URL
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://your-app.vercel.app/api/webhooks/calendly';

if (!PAT) {
  console.error('❌ Error: CALENDLY_API_KEY is not set in .env or .env.local');
  process.exit(1);
}

async function register() {
  console.log('🚀 Starting Calendly Webhook registration...');

  try {
    // 1. Get User/Org Info
    const userRes = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': `Bearer ${PAT}` }
    });
    
    if (!userRes.ok) {
      const err = await userRes.json();
      throw new Error(`Failed to fetch user info: ${JSON.stringify(err)}`);
    }

    const userData = await userRes.json();
    const orgUri = userData.resource.current_organization;
    const userUri = userData.resource.uri;

    console.log(`✅ Connected as: ${userData.resource.name}`);
    console.log(`✅ Org URI: ${orgUri}`);

    // 2. Subscribe to Webhook
    const subRes = await fetch('https://api.calendly.com/webhook_subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        events: ['invitee.created', 'invitee.canceled'],
        organization: orgUri,
        scope: 'user'
      })
    });

    const result = await subRes.json();

    if (!subRes.ok) {
      throw new Error(`Failed to subscribe: ${JSON.stringify(result)}`);
    }

    console.log('🎉 Webhook successfully registered!');
    console.log('Details:', JSON.stringify(result.resource, null, 2));
    console.log('\nNext Step: Ensure your server is running and accessible at the URL above.');

  } catch (error) {
    console.error('❌ Registration failed:', error.message);
  }
}

register();
