import { Dropdown } from './Dropdown';

const EMOJIS = [
  '🎯', '🏁', '🏅', '🫀', '🏃', '💪', '🚴', '🏊', '🧘', '🥗', '😴', '⛰️',
  '💼', '🎓', '📨', '💻', '📈', '💰', '🤝', '🛠️', '✍️', '📚', '🧠', '🗣️',
  '🌱', '🎨', '🎸', '📷', '🍳', '🏠', '❤️', '👪', '🌍', '✈️', '⭐', '🔥',
  '🔁', '🏋️', '🚶', '💧', '🥦', '📝', '🌅', '📵',
];

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <Dropdown
      button={(_, toggle) => (
        <button type="button" className="emoji-btn" onClick={toggle} aria-label="Symbol wählen">
          {value}
        </button>
      )}
    >
      {(close) => (
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onChange(e);
                close();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
