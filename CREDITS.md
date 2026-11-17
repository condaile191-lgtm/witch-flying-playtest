# Background music

All three selected tracks are CC0 1.0 Public Domain Dedication:
https://creativecommons.org/publicdomain/zero/1.0/

| Local file | Author / track | Author's source page | Scene |
| --- | --- | --- | --- |
| audio/fairy-adventure.ogg | MintoDog — Fairy Adventure | https://opengameart.org/content/fairy-adventure | Title / flower coast |
| audio/whispers-in-the-fog.ogg | Ruhinre — Whispers in the Fog | https://opengameart.org/content/whispers-in-the-fog | Mist forest |
| audio/superhero.ogg | Cleyton Kauffman — Superhero (no intro) | https://opengameart.org/content/adventure-theme | Desert / storm / boss |

Music is played from local OGG files using HTMLAudioElement, never synthesized with Web Audio. Web Audio is retained for short gameplay sound effects and wind only. Music does not block startup.

Run `python tools/download_music.py` to obtain the actual tracks from their authors' OpenGameArt uploads. A release must contain all three valid OGG files; selecting tracks is not evidence that downloads completed.

The game baseline and bundled artwork were supplied by the project owner in `witch-flight_-arcane-drift.zip`.
