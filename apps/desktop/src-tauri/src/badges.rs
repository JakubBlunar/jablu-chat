//! Unread indicators drawn at runtime.
//!
//! These are a red dot on the tray icon and a taskbar overlay badge. Both are
//! generated in code rather than shipped as assets so they scale with whatever
//! icon the bundle carries and cannot drift out of sync with it.

use tauri::image::Image;

/// Red matching the web client's unread badge.
const DOT: [u8; 3] = [237, 66, 69];
/// Outline colour, so the dot reads against both light and dark icon pixels.
const OUTLINE: [u8; 3] = [30, 31, 34];

/// Blends a filled circle into an RGBA buffer, antialiased over one pixel of edge.
fn draw_circle(rgba: &mut [u8], width: u32, height: u32, cx: f32, cy: f32, radius: f32, color: [u8; 3]) {
    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            let distance = (dx * dx + dy * dy).sqrt();
            let coverage = (radius + 0.5 - distance).clamp(0.0, 1.0);
            if coverage <= 0.0 {
                continue;
            }

            let idx = ((y * width + x) * 4) as usize;
            let alpha = (coverage * 255.0) as u8;
            for channel in 0..3 {
                let existing = rgba[idx + channel] as f32;
                rgba[idx + channel] =
                    (existing * (1.0 - coverage) + color[channel] as f32 * coverage) as u8;
            }
            rgba[idx + 3] = rgba[idx + 3].max(alpha);
        }
    }
}

/// The app icon with an unread dot in the bottom-right corner, for the tray.
pub fn with_corner_dot(base: &Image<'_>) -> Option<Image<'static>> {
    let width = base.width();
    let height = base.height();
    if width == 0 || height == 0 {
        return None;
    }

    let mut rgba = base.rgba().to_vec();
    let radius = (width.min(height) as f32) * 0.28;
    let cx = width as f32 - radius - 1.0;
    let cy = height as f32 - radius - 1.0;

    draw_circle(&mut rgba, width, height, cx, cy, radius + 1.5, OUTLINE);
    draw_circle(&mut rgba, width, height, cx, cy, radius, DOT);

    Some(Image::new_owned(rgba, width, height))
}

/// A standalone dot for the Windows taskbar overlay, which is drawn small and
/// square so it does not need the app icon underneath it.
#[cfg(windows)]
pub fn unread_overlay() -> Option<Image<'static>> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let center = SIZE as f32 / 2.0;

    draw_circle(&mut rgba, SIZE, SIZE, center, center, center - 1.0, OUTLINE);
    draw_circle(&mut rgba, SIZE, SIZE, center, center, center - 3.0, DOT);

    Some(Image::new_owned(rgba, SIZE, SIZE))
}
