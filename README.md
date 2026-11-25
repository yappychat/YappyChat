# YappyChat changelog

YappyChat is a moderation-first Twitch chat client for Windows. This file lists the main changes in recent versions. Downloads are on the Releases page and https://yappy.chat.

<!-- release notes: written by tools/sync-site.js from renderer/releases.js -->
## New in 1.0.1

- **Whispers, like a messaging app.** One row per person with their latest message and an unread count. Click one to open the conversation in its own window.
- **Nicknames.** Give someone a nickname from the pencil on their user card. Only you see it: chat shows the nickname, and typing @nickname sends their real Twitch name.
- **Fewer pop-ups after a ban.** YappyChat no longer asks for a note after every ban.
- **Steadier chat connection.** Quiet chats, like an offline channel, no longer show "Lost the connection" while YappyChat is minimised, and Twitch's routine server moves reconnect silently.
- **Turn off unread counts.** Settings > Appearance > Unread counts hides the red numbers on the bell, live channels and tabs.

Earlier versions: https://yappy.chat/changelog
<!-- /release notes -->

## Installer size
The Windows installer is about 70 to 85 MB, mostly the Chromium engine that Electron includes.

## Known limits
- Polls, predictions, raids, ads, markers and the title and game editor only work through Twitch's API for the channel owner.
- YappyChat is unofficial and not affiliated with Twitch.
