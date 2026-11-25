# How this project was made

An AI coding agent (Claude, in Claude Code) built this project from the prompt below. Section 1 is the
**bootstrap prompt**, unedited, with any clarifying questions and their answers. Section 2 lists the
**follow-up directions** that changed scope or direction. Small fixes are left out.

The idea came up while blurring faces in a private video, in the same session.

---

## 1. Bootstrap prompt

> is there a browser offline way to do this? so I can create a website where people "upload" a picture and
> get it with blurred face. but the picture never leaves the browser

**Clarifying questions:**

| Question | Answer |
|---|---|
| Who is it for (you and family, or public)? Spanish? Under marcelloavila.com? What does the first version need (photos only; blur every face, tap to keep one clear; draw boxes by hand; download)? | "build it in spanish, for the public. it'll be on maravfe.github.io. for pictures only for now. is redcording visits an analytics? no private data, just size of picture and number of root visits. size of picture could be too much i know but just acecss? yes blur every face and tap to unblur. also allow 3 options: plain blur, smiley face emoji" |

## 2. Follow-up directions

- 2026-11-25 — Count only root visits ("just access"), not picture size. Three cover styles; only two were
  named, so Pixelado was chosen as the third (see docs/DECISIONS.md).
- 2026-11-25 — "it's so perfect. just add a placeholder picture".
- 2026-11-25 — "we'll update the texts: top text: Tapá las caras en tu foto! (Sin subirla a internet). Then the
  blue square is collapsible with the title "Esto es seguro?" and the inside: Esto no se sube a internet, todo
  funciona desde tu teléfono. Si lo querés confirmat, podés apagar el internet y verás como el sitio igual
  funciona con normalidad (wink emoji). Además, la foto que estás bajando, no trae fecha ni datos de GPS."
  Below the download picture: "Te tapamos 3 caras. Podés tocar cada una para deshacerlo o arrastrar si faltó
  alguna!". Nothing below the picture other than the sources."
- 2026-11-25 — "tested it on a phone, all works perfect and offline too. you know what, this is very simple,
  translate to english so the site can react according to the phone".
