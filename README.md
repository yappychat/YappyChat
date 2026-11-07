# YappyChat changelog

YappyChat is a moderation-first Twitch chat client for Windows. This file lists the main changes in recent versions. Downloads are on the Releases page and https://yappy.chat.

<!-- release notes: written by tools/sync-site.js from renderer/releases.js -->
## New in 1.0.0

- **Choose your seat when you sign in.** Moderator, Streamer or Viewer, right on the sign-in screen. Twitch is only asked for what that seat uses, and the buttons and activity rail are set up to suit you. Whispers and channel-owner tools ask the first time you use them.
- **Stay signed in, update when you choose.** YappyChat no longer asks you to log in each day. New versions download in the background and wait in the top bar until you press Update ready. Inside, the app is more tightly sealed off, so only its own window can use its features.
- **Every chat you moderate, in one place.** AutoMod, Mod activity and Unbans cover every chat you moderate, in each channel's colour when several are on screen. Moderators can start polls and predictions through Twitch's Mod View, and in your own channel Mods and VIPs and Banned users sit in the chat header.
- **A tidier activity rail.** Chat tabs and moderation tabs sit in two groups, and new installs show each tab's name. Tools you add, like Chat filters, open in the panel like any other tab. Live has its own button in the top bar, and picking a channel from Went live opens its chat and stream.
- **Cleaner user cards.** One moderation block with the timeouts in a single strip, the account's age, follow and subscription, and a copy button for their name. If someone changes their Twitch name, their messages show "was oldname" for a week and your notes follow them. Hover a sub badge for the tier and months.
- **Warn with your rules.** Click into the reason box and your channel's rules and saved reasons appear underneath. Add or remove rules in Notes, beside Shield. Ban everywhere and Ban on sight wait under the … button.
- **A chat summary for your mod team.** Mod tools > Summary (or /summary) writes a recap to paste into your team's Discord: how busy chat was, moderation totals for the whole team (no moderator is named), the most active chatters and the words behind bans and timeouts, with suggestions for blocked terms.
- **Focus, for busy streams.** The moon in the top bar (or Ctrl+Shift+D) quiets YappyChat: Yappy sits still, pop-ups wait in the rail, only urgent sounds play and name effects stop moving. The header is calmer too: a dot only shows while chat is connecting.
- **Streams your way.** Drag the divider between two chats and the streams resize to match. Minimised to the taskbar, streams keep playing; in the tray they pause. Emotes keep moving while a stream plays, and switching channel keeps its sound.
- **Little things that add up.** Whispers stay after you close YappyChat. Give a macro its own command, like /blob. Spell check, fresh notification sounds, and bigger buttons with Compact layout off. A short note from the YappyChat team can appear in the top bar for known issues.

Earlier versions: https://yappy.chat/changelog
<!-- /release notes -->

## Installer size
The Windows installer is about 70 to 85 MB, mostly the Chromium engine that Electron includes.

## Known limits
- Polls, predictions, raids, ads, markers and the title and game editor only work through Twitch's API for the channel owner.
- YappyChat is unofficial and not affiliated with Twitch.
