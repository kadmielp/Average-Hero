# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2025-12-05

### Added
- **UI and logic**: Added different playstyles to be selected on the main screen (solo right hand, solo left hand only, duet)
- **UI**: Playstyles selected on the main screen now appear on the Select Track page.
- **UI** Select Track page now show the song lenght and % of notes in each hand.

### Changed
- **Visuals**: Replaced asteroid notes with 4-pointed star shapes.
- **Visuals**: Added 3D bevels and spin animation to notes.
- **Visuals**: Removed white center circle and flash effect from notes.
- **UI**: Removed author from the note title (used to appear as "Unknown").
- **UI**: Swapped "Solo (Right)" and "Solo (Left)" buttons on the Home Page for better ergonomics.
- **UI**: Simplified Gameplay HUD by removing the artist name to reduce clutter.

### Fixed
- **Gameplay**: Fixed countdown timer continuing to run when the game is paused.
- **Gameplay**: Fixed countdown timer getting stuck on screen when navigating away from a paused game.
- **Gameplay**: Hid the notes and effects from unused hand (when play solo for left or right hand).