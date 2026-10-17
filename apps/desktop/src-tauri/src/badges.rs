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

/// A numeric Windows overlay. Three compact glyphs keep "99+" readable at 16px.
#[cfg(any(windows, test))]
pub fn unread_overlay(count: i64) -> Option<Image<'static>> {
    if count <= 0 {
        return None;
    }
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let center = SIZE as f32 / 2.0;

    draw_circle(&mut rgba, SIZE, SIZE, center, center, center - 1.0, OUTLINE);
    draw_circle(&mut rgba, SIZE, SIZE, center, center, center - 3.0, DOT);

    let label = if count > 99 { "99+".to_owned() } else { count.to_string() };
    let glyphs = [
        [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7],
        [7, 1, 7, 1, 7], [5, 5, 7, 1, 1], [7, 4, 7, 1, 7],
        [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7],
        [7, 5, 7, 1, 7], [0, 2, 7, 2, 0],
    ];
    let scale = if label.len() == 1 { 3 } else { 2 };
    let text_width = (label.len() as u32 * 4 - 1) * scale;
    let left = (SIZE - text_width) / 2;
    let top = (SIZE - 5 * scale) / 2;
    for (index, digit) in label.bytes().enumerate() {
        let glyph = &glyphs[if digit == b'+' { 10 } else { (digit - b'0') as usize }];
        for (row, bits) in glyph.iter().enumerate() {
            for col in 0..3 {
                if bits & (1 << (2 - col)) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x = left + index as u32 * 4 * scale + col * scale + dx;
                        let y = top + row as u32 * scale + dy;
                        let offset = ((y * SIZE + x) * 4) as usize;
                        rgba[offset..offset + 4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
        }
    }
    Some(Image::new_owned(rgba, SIZE, SIZE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_clears_at_zero() {
        assert!(unread_overlay(0).is_none());
        assert!(unread_overlay(-1).is_none());
    }

    #[test]
    fn overlay_renders_counts_and_caps_at_99_plus() {
        let one = unread_overlay(1).unwrap();
        let twelve = unread_overlay(12).unwrap();
        assert_eq!((one.width(), one.height()), (32, 32));
        assert_ne!(one.rgba(), twelve.rgba());
        assert!(one.rgba().chunks_exact(4).any(|pixel| pixel == [255, 255, 255, 255]));
        assert_eq!(unread_overlay(100).unwrap().rgba(), unread_overlay(i64::MAX).unwrap().rgba());
        assert_ne!(unread_overlay(99).unwrap().rgba(), unread_overlay(100).unwrap().rgba());
    }
}
