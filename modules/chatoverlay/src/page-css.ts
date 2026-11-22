// The overlay's stylesheet, shared by the page in OBS (served as style.css) and the preview in the app, so both look the
// same. Every rule sits below .stz-chat-overlay; the values the streamer picks arrive as custom properties on that
// element (the page's script and the preview set them from an OverlayStyle). No Node imports.

export const OVERLAY_CSS = `
.stz-chat-overlay {
  --co-font-size: 22px;
  --co-font: system-ui, sans-serif;
  --co-text: #ffffff;
  --co-bg: transparent;
  --co-name: #ff730f;
  --co-width: 600px;
  box-sizing: border-box;
  width: var(--co-width);
  max-width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.35em;
  padding: 0.5em 0.7em;
  font: 500 var(--co-font-size) / 1.35 var(--co-font);
  color: var(--co-text);
  background: var(--co-bg);
  overflow: hidden;
  overflow-wrap: anywhere;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 0 6px rgba(0, 0, 0, 0.35);
}
.stz-chat-overlay[data-direction="down"] { justify-content: flex-start; }
.stz-chat-overlay[data-align="right"] { margin-left: auto; text-align: right; }
.stz-chat-overlay *, .stz-chat-overlay *::before, .stz-chat-overlay *::after { box-sizing: inherit; }

.stz-chat-overlay .co-item {
  flex: none;
  animation: co-enter 0.25s ease-out;
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.stz-chat-overlay .co-item.co-fading { opacity: 0; transform: translateY(-0.3em); }
@keyframes co-enter {
  from { opacity: 0; transform: translateY(0.4em); }
  to { opacity: 1; transform: none; }
}

.stz-chat-overlay .co-badge {
  display: inline-block;
  vertical-align: 0.1em;
  margin-right: 0.3em;
  padding: 0 0.3em;
  border-radius: 0.25em;
  font-size: 0.55em;
  font-weight: 800;
  line-height: 1.6;
  letter-spacing: 0.06em;
  color: #fff;
  background: #6b7280;
  text-shadow: none;
}
.stz-chat-overlay .co-badge.broadcaster { background: #e91916; }
.stz-chat-overlay .co-badge.mod { background: #00ad03; }
.stz-chat-overlay .co-badge.vip { background: #e005b9; }
.stz-chat-overlay .co-badge.sub { background: #7c3aed; }

.stz-chat-overlay .co-name { font-weight: 800; color: var(--co-name); }
.stz-chat-overlay .co-sep { opacity: 0.8; }
.stz-chat-overlay .co-mention { font-weight: 700; }
.stz-chat-overlay .co-emote { font-weight: 700; opacity: 0.95; }
.stz-chat-overlay img.co-emote {
  height: 1.4em;
  width: auto;
  vertical-align: middle;
  margin: -0.3em 0.05em;
}

.stz-chat-overlay .co-event {
  font-style: italic;
  font-weight: 600;
  opacity: 0.95;
}
.stz-chat-overlay .co-event::before {
  content: "";
  display: inline-block;
  width: 0.45em;
  height: 0.45em;
  margin-right: 0.45em;
  border-radius: 50%;
  background: var(--co-name);
  vertical-align: 0.1em;
}
.stz-chat-overlay .co-item.co-test .co-name::after {
  content: "test";
  margin-left: 0.4em;
  font-size: 0.55em;
  font-weight: 700;
  opacity: 0.6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
`;
