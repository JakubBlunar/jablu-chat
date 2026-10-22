# Context menus

`apps/web/src/components/ui/ContextMenu.tsx` owns interaction and presentation. Wrap one native interactive element (or a component that forwards HTML event handlers and ARIA attributes) and supply `label` and `items`. It preserves the child's ref and normal click behavior. Set `openOnClick` for a visible menu button such as the server header.

- Desktop: right click, the context-menu key, or Shift+F10 opens a popup at the pointer or focused trigger. Arrow keys, Home/End, Enter/Space, Escape and Tab work without a mouse. Popups fit the viewport and close on outside interaction, scrolling or resizing.
- Touch: a 500 ms hold opens the existing `BottomSheet`, including on tablets. Moving more than 8 px, scrolling, cancellation, a second touch or unmounting cancels the hold. The following click and duplicate browser context menu are suppressed.
- Items support actions, disabled states, checkmarks, separators, submenus and live range sliders. Submenus open by click/tap or ArrowRight; Back/ArrowLeft returns. Actions close the menu; sliders keep it open. Use translated labels and enforce permissions before supplying actions.
- Triggers don't add a wrapper element, so list markup and drag references stay intact. Desktop popups portal to the document body, or the owning dialog to respect its focus trap. Touch sheets use the shared dialog focus and back-gesture behavior. Nested triggers consume their gestures; only one context menu is open at a time.

`useServerMenuItems` shares server action labels and ordering between the server rail and both sidebars. Callers own navigation, permissions and dialogs; they provide callbacks only for actions they can perform. `ServerContextMenu`, `ChannelContextMenu`, `CategoryContextMenu` and `VoiceParticipantContextMenu` are reusable feature adapters.

Mobile server reordering uses **Organize servers**. The rail retains mouse and keyboard dragging; touch holding is reserved for menus.

Voice participant volume changes use the existing saved per-user overrides and affect only the listener. A user's own row exposes mute, deafen and a persisted output-volume multiplier. Both new tracks and existing tracks use that multiplier; deafening always silences playback. Controls for another voice channel are disabled.
