# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (0.x while the project is young).

## [Unreleased]

### Added
- Spanish page that finds faces in a photo with YuNet and covers them all by default, in the browser only.
- Tap a face to uncover or re-cover it; drag to cover a face the detector missed.
- Three cover styles: Difuminado, Pixelado, Carita 🙂.
- Download as JPEG without the original's location or camera metadata.
- Content-Security-Policy that forbids sending data anywhere; checked by the self-test.
- Optional visit counting (page opens only) via a GoatCounter pixel, off until a code is set.
