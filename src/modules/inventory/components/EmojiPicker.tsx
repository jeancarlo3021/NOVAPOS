import React, { useState } from 'react';

const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: '🍽️ Restaurante & Cocina',
    emojis: ['🍽️','🍳','🥘','🫕','🥗','🍱','🥙','🌮','🌯','🫔','🥪','🍔','🌭','🍕','🥨','🥚','🍳','🧆','🥞','🧇'],
  },
  {
    label: '🥩 Frituras & Antojitos',
    emojis: ['🥩','🍖','🍗','🥓','🌽','🫘','🥜','🫓','🧀','🥚','🍟','🍢','🥟','🦐','🦑','🦀','🐟','🐷','🐄','🐔'],
  },
  {
    label: '🥤 Bebidas',
    emojis: ['🥤','🧃','☕','🫖','🧋','🍵','🥛','🍺','🍻','🥂','🍷','🍹','🧉','🥃','🍾','🫗','🍶','🧊','🫙','🍼'],
  },
  {
    label: '🍰 Panadería & Postres',
    emojis: ['🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🥧','🍡','🍦','🍧','🍨','🥐','🍞','🥖','🥯','🧆'],
  },
  {
    label: '🥬 Frutas & Verduras',
    emojis: ['🥬','🥦','🧄','🧅','🥕','🌽','🥒','🍅','🍆','🥑','🫑','🌶️','🫛','🍋','🍊','🍎','🍌','🍓','🍇','🍉'],
  },
  {
    label: '🛒 Abarrotes & Tienda',
    emojis: ['🛒','🧴','🧻','🧼','🪣','🧹','🧺','🪴','🕯️','🪔','🫙','🥫','🧂','🍯','🛍️','📦','🪤','🧯','🔦','🪜'],
  },
  {
    label: '👕 Ropa & Accesorios',
    emojis: ['👕','👖','👗','👘','🧥','🧣','🧤','🧦','👟','👠','👡','👢','👒','🎩','💍','💎','👜','👝','🎒','👓'],
  },
  {
    label: '💻 Electrónica & Tech',
    emojis: ['💻','📱','⌨️','🖥️','🖨️','🖱️','📷','📸','🎮','🕹️','📺','📻','🎧','🎤','🔌','🔋','💡','🔦','📡','⌚'],
  },
  {
    label: '🏠 Hogar & Ferretería',
    emojis: ['🏠','🪑','🛋️','🛏️','🚿','🪠','🔧','🔨','🪛','🪚','⚙️','🔩','🪤','🪜','🧲','💈','🪞','🚪','🪟','🏗️'],
  },
  {
    label: '💊 Salud & Cuidado',
    emojis: ['💊','💉','🩺','🩹','🧬','🔬','🏥','🩻','🧪','🧫','💆','💅','🪥','🧴','🧹','🫧','🌡️','⚕️','🩺','🏋️'],
  },
  {
    label: '🚗 Autos & Servicios',
    emojis: ['🚗','🛻','🚚','🛵','🏍️','⛽','🔧','🔩','🛞','🪝','🪣','🪤','⚙️','🔑','🗝️','🧰','🛠️','🪛','🪜','🏎️'],
  },
  {
    label: '📦 General',
    emojis: ['📦','🏪','🏬','🏭','💰','💵','💳','🧾','📋','📊','📈','🎯','⭐','🔖','🏷️','🎁','🎀','🛍️','🪙','💼'],
  },
];

export interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(EMOJI_GROUPS[0].label);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Selected + custom input */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-3xl leading-none">{value || '📦'}</span>
        <div className="flex-1">
          <p className="text-xs text-gray-500 mb-0.5">Seleccionado — o escribe uno personalizado:</p>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            maxLength={2}
            placeholder="📦"
            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            style={{ width: '3.5rem' }}
          />
        </div>
      </div>

      {/* Groups */}
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {EMOJI_GROUPS.map(group => (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition text-left"
            >
              {group.label}
              <span className="text-gray-400">{openGroup === group.label ? '▲' : '▼'}</span>
            </button>
            {openGroup === group.label && (
              <div className="flex flex-wrap gap-1 px-3 pb-3 pt-1">
                {group.emojis.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onChange(emoji)}
                    title={emoji}
                    className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition hover:bg-blue-50 ${
                      value === emoji ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:scale-110'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
