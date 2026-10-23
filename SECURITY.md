# Security

YappyChat is a Windows desktop app for Twitch chat and moderation. This page says what it protects, what you can switch on, and where the limits are.

## What is protected by default

- **Your Twitch login is encrypted on your computer** with Windows' own protection (Electron `safeStorage`, which uses DPAPI), for your Windows account only. If that protection is unavailable the login is not saved at all, never in plain text. It is deleted when you log out, and on log out YappyChat also asks Twitch to **revoke** the token (switch off in *Settings > Security*). Twitch is asked whether the login is still valid when the app starts and every hour; if Twitch says no, you are logged out.
- **Tokens never reach logs.** Errors are written to a local diagnostics log with anything token-shaped removed. Network errors are reported as "timeout" or "network", never with the address and its query string.
- **No Node.js in the page.** The page that draws the app runs with `contextIsolation: true` and no Node.js access. It talks to the main process only through a small, named set of calls.
- **Network allow-list.** The main process refuses web requests from the app to anything except the few hosts it needs (Twitch, the emote services, the recent-messages service and the YappyChat supporter server). Page navigation and new windows are denied; links open in your normal browser.
- **Browser permissions are denied** (camera, microphone, location, notifications prompts and so on) except the few the Twitch player needs.
- **Least permission.** Login asks only for everyday permissions (and no moderator ones if you tick "I only chat"). Optional ones (user list, banned and moderator lists, AutoMod settings, shoutouts, clips, polls and predictions) are asked for **only when you open the tool that needs them**, one at a time, with the reason shown. *Settings > About* lists every permission and can drop all optional ones.
- **Nothing leaves your computer by default.** Chat, notes, whispers and logs stay on disk in `%APPDATA%\YappyChat`. The supporter server receives your token only to confirm who you are when you change perks, and does not store it.

## Things you can switch on (Settings > Security)

| Setting | What it does |
|---|---|
| App lock (passcode) | Locks YappyChat at start and after an idle time. The passcode is never stored: only a random salt and a PBKDF2-SHA-256 hash (210,000 rounds). Repeated wrong tries add a growing delay. "Forgot it" logs you out of Twitch, which removes the lock. |
| Lock when Windows locks or sleeps, or when sent to the tray | On by default once a passcode is set, so it is never left open behind a locked computer. |
| Hide from screen sharing | Uses the operating system's content protection so OBS window capture, Discord share and screenshots show a black window. |
| Revoke on logout | Cancels the login token at Twitch, not just on your computer. On by default. |
| Accept /alert | Lets your moderators send you a full-window alert. Off if you do not stream. |

## /alert and spoofing

`/alert` travels as a Twitch whisper starting with a fixed prefix. Anyone can type that prefix, so the receiving app **checks the sender is a moderator of your channel** (from chat badges, or Twitch's moderator list) before showing anything. From anyone else it is displayed as an ordinary whisper.

## Checkout and perks (server)

- Buying needs a Twitch sign-in on the website. The server uses the authorization code flow with a `state` value tied to a short-lived cookie, then **revokes** the Twitch token and keeps only its own session id. The cookie is HttpOnly, Secure, SameSite=Lax and `__Host-` prefixed; the database holds its SHA-256.
- Every request that changes something with a session must come from the site's own origin (Origin, Referer and Sec-Fetch-Site checks).
- The app-to-website hand-off uses a 256-bit random code, valid for 2 minutes, usable once (atomic claim), stored hashed and bound to the Twitch user. It travels in the URL fragment, which is never sent to servers or in Referer headers, and it only creates a session after the person confirms "Continue as …" (against login CSRF).
- Prices are set by the server. Perks are granted from one place, once per order. Webhooks are verified before anything is stored: Stripe with HMAC-SHA256 and a 5-minute window; PayPal by postback or local certificate check, with our webhook id in the signed message and a 5-minute window. Duplicates are ignored by event id; failures are retried, then dead-lettered.
- Refunds and chargebacks remove the perks from that order.
- Card data never touches YappyChat: payment happens on Stripe's or PayPal's own pages.
- Tested against fake providers only (`server/test-payments.js`), **not live Stripe or PayPal accounts**.

## Limits, honestly

- The lock is a privacy screen, not disk encryption. Someone with access to your Windows account and files can still reach what is stored there.
- "Hide from screen sharing" depends on the capture software respecting Windows' protection flag. Test with your own setup before relying on it on stream.
- Polls, predictions, raids, ads, markers and the title and game editor only work through Twitch's API for the **channel owner**. This is Twitch's rule, not a setting.
- Several streams: each is Twitch's own player page in a webview that uses its own storage area (separate from the rest of the app). YappyChat does not read or change what plays in it.
- YappyChat is unofficial and not affiliated with Twitch.

## Reporting a problem

Please do not post security issues publicly. Use the contact page on the website (https://yappy.chat/contact) and say it is a security report. We will reply, fix it and credit you if you wish.
