# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x while the project is young).

## [Unreleased]

### Changed
- Texts rewritten in Costa Rican voseo; the safety note is now a collapsible "¿Esto es seguro?" box.

### Added
- Pixelated-face favicon and home-screen icon.
- English version, chosen automatically when the phone's first language isn't Spanish.
- Sample drawing of the three cover styles where the photo goes, until one is chosen.
- Spanish page that finds faces in a photo with YuNet and covers them all by default, in the browser only.
- Tap a face to uncover or re-cover it; drag to cover a face the detector missed.
- Three cover styles: Difuminado, Pixelado, Carita 🙂.
- Download as JPEG without the original's location or camera metadata.
- Content-Security-Policy that forbids sending data anywhere; checked by the self-test.
- Visit counting (page opens only, as `/tapacaras/`) via a GoatCounter pixel on marcelloavila.com.
