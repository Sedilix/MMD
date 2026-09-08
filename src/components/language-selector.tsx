"use client";

import { useEffect, useState, useRef } from "react";
import Script from "next/script";

const LANGUAGES = [
  { code: 'af', label: 'Afrikaans', flag: '🇿🇦' },
  { code: 'sq', label: 'Shqip', flag: '🇦🇱' },
  { code: 'am', label: 'አማርኛ', flag: '🇪🇹' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hy', label: 'Հայերեն', flag: '🇦🇲' },
  { code: 'az', label: 'Azərbaycan', flag: '🇦🇿' },
  { code: 'eu', label: 'Euskara', flag: '🇪🇸' },
  { code: 'be', label: 'Беларуская', flag: '🇧🇾' },
  { code: 'bn', label: 'বাংলা', flag: '🇧🇩' },
  { code: 'bs', label: 'Bosanski', flag: '🇧🇦' },
  { code: 'bg', label: 'Български', flag: '🇧🇬' },
  { code: 'ca', label: 'Català', flag: '🇪🇸' },
  { code: 'ceb', label: 'Cebuano', flag: '🇵🇭' },
  { code: 'ny', label: 'Chichewa', flag: '🇲🇼' },
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'co', label: 'Corsu', flag: '🇫🇷' },
  { code: 'hr', label: 'Hrvatski', flag: '🇭🇷' },
  { code: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { code: 'da', label: 'Dansk', flag: '🇩🇰' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'eo', label: 'Esperanto', flag: '🏳️' },
  { code: 'et', label: 'Eesti', flag: '🇪🇪' },
  { code: 'tl', label: 'Filipino', flag: '🇵🇭' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'fy', label: 'Frysk', flag: '🇳🇱' },
  { code: 'gl', label: 'Galego', flag: '🇪🇸' },
  { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'el', label: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'gu', label: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'ht', label: 'Kreyòl', flag: '🇭🇹' },
  { code: 'ha', label: 'Hausa', flag: '🇳🇬' },
  { code: 'haw', label: 'Hawaiʻi', flag: '🇺🇸' },
  { code: 'iw', label: 'עברית', flag: '🇮🇱' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'hmn', label: 'Hmoob', flag: '🇱🇦' },
  { code: 'hu', label: 'Magyar', flag: '🇭🇺' },
  { code: 'is', label: 'Íslenska', flag: '🇮🇸' },
  { code: 'ig', label: 'Igbo', flag: '🇳🇬' },
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'ga', label: 'Gaeilge', flag: '🇮🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'jw', label: 'Jawa', flag: '🇮🇩' },
  { code: 'kn', label: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'kk', label: 'Қазақ', flag: '🇰🇿' },
  { code: 'km', label: 'ខ្មែរ', flag: '🇰🇭' },
  { code: 'rw', label: 'Kinyarwanda', flag: '🇷🇼' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ku', label: 'Kurdî', flag: '🇮🇶' },
  { code: 'ky', label: 'Кыргызча', flag: '🇰🇬' },
  { code: 'lo', label: 'ລາວ', flag: '🇱🇦' },
  { code: 'la', label: 'Latina', flag: '🇻🇦' },
  { code: 'lv', label: 'Latviešu', flag: '🇱🇻' },
  { code: 'lt', label: 'Lietuvių', flag: '🇱🇹' },
  { code: 'lb', label: 'Lëtzebuergesch', flag: '🇱🇺' },
  { code: 'mk', label: 'Македонски', flag: '🇲🇰' },
  { code: 'mg', label: 'Malagasy', flag: '🇲🇬' },
  { code: 'ms', label: 'Melayu', flag: '🇲🇾' },
  { code: 'ml', label: 'മലയാളം', flag: '🇮🇳' },
  { code: 'mt', label: 'Malti', flag: '🇲🇹' },
  { code: 'mi', label: 'Māori', flag: '🇳🇿' },
  { code: 'mr', label: 'मराठी', flag: '🇮🇳' },
  { code: 'mn', label: 'Монгол', flag: '🇲🇳' },
  { code: 'my', label: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'ne', label: 'नेपाली', flag: '🇳🇵' },
  { code: 'no', label: 'Norsk', flag: '🇳🇴' },
  { code: 'or', label: 'ଓଡ଼ିଆ', flag: '🇮🇳' },
  { code: 'ps', label: 'پښتو', flag: '🇦🇫' },
  { code: 'fa', label: 'فارسی', flag: '🇮🇷' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'ro', label: 'Română', flag: '🇷🇴' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'sm', label: 'Samoa', flag: '🇼🇸' },
  { code: 'gd', label: 'Gàidhlig', flag: '🇬🇧' },
  { code: 'sr', label: 'Српски', flag: '🇷🇸' },
  { code: 'st', label: 'Sesotho', flag: '🇱🇸' },
  { code: 'sn', label: 'Shona', flag: '🇿🇼' },
  { code: 'sd', label: 'سنڌي', flag: '🇵🇰' },
  { code: 'si', label: 'සිංහල', flag: '🇱🇰' },
  { code: 'sk', label: 'Slovenčina', flag: '🇸🇰' },
  { code: 'sl', label: 'Slovenščina', flag: '🇸🇮' },
  { code: 'so', label: 'Soomaali', flag: '🇸🇴' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'su', label: 'Sunda', flag: '🇮🇩' },
  { code: 'sw', label: 'Kiswahili', flag: '🇰🇪' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'tg', label: 'Тоҷикӣ', flag: '🇹🇯' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'tt', label: 'Татар', flag: '🇷🇺' },
  { code: 'te', label: 'తెలుగు', flag: '🇮🇳' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'tk', label: 'Türkmen', flag: '🇹🇲' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ur', label: 'اردو', flag: '🇵🇰' },
  { code: 'ug', label: 'ئۇيغۇرچە', flag: '🇨🇳' },
  { code: 'uz', label: 'Oʻzbek', flag: '🇺🇿' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'cy', label: 'Cymraeg', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { code: 'xh', label: 'isiXhosa', flag: '🇿🇦' },
  { code: 'yi', label: 'ייִדיש', flag: '🇮🇱' },
  { code: 'yo', label: 'Yorùbá', flag: '🇳🇬' },
  { code: 'zu', label: 'isiZulu', flag: '🇿🇦' }
];

export function LanguageSelector() {
  const [currentLang, setCurrentLang] = useState("en");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (window as any).googleTranslateElementInit = () => {
      new (window as any).google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: LANGUAGES.map(l => l.code).join(','),
          layout: (window as any).google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

    // Attempt to read the current language from the cookie on mount
    const match = document.cookie.match(/googtrans=\/[a-zA-Z-]+\/([a-zA-Z-]+)/);
    if (match && match[1]) {
      setCurrentLang(match[1]);
    }

    // Click outside listener to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode);
    setIsOpen(false);
    
    // Set Google Translate cookie
    document.cookie = `googtrans=/en/${langCode}; path=/`;
    document.cookie = `googtrans=/en/${langCode}; path=/; domain=${window.location.hostname}`;
    
    const select = document.querySelector(".goog-te-combo") as HTMLSelectElement;
    if (select) {
      select.value = langCode;
      select.dispatchEvent(new Event("change"));
    }
    
    // Force reload to apply translations cleanly
    window.location.reload();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Script
        src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="lazyOnload"
      />
      
      {/* Hidden original google translate widget */}
      <div 
        id="google_translate_element" 
        className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
      ></div>

      {/* Custom Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-transparent hover:bg-white/5 rounded-md h-9 px-2 md:px-3 border border-transparent hover:border-zinc-800 transition-all cursor-pointer focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select Language"
      >
        <span className="text-base leading-none">
          {LANGUAGES.find(l => l.code === currentLang)?.flag || '🇺🇸'}
        </span>
        <span className="text-zinc-300 text-[10px] md:text-xs font-headline uppercase tracking-widest hidden sm:block">
          {LANGUAGES.find(l => l.code === currentLang)?.code || 'EN'}
        </span>
      </button>

      {/* Custom Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 origin-top-right animate-in slide-in-from-top-2 fade-in zoom-in-95 duration-200">
          <ul 
            className="max-h-[300px] overflow-y-auto custom-scrollbar py-1"
            role="listbox"
            aria-label="Languages"
          >
            {LANGUAGES.map((lang) => (
              <li key={lang.code} role="presentation">
                <button
                  onClick={() => handleLanguageChange(lang.code)}
                  role="option"
                  aria-selected={currentLang === lang.code}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-headline tracking-wider transition-all duration-200 ${
                    currentLang === lang.code 
                      ? "text-[#008aff] bg-[#008aff]/10 font-bold" 
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="text-base leading-none">{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx global>{`
        /* Hide the Google Translate top banner and popups */
        body { top: 0 !important; }
        .goog-te-banner-frame.skiptranslate { display: none !important; }
        .skiptranslate > iframe.goog-te-banner-frame { display: none !important; }
        #goog-gt-tt { display: none !important; }
        .goog-te-spinner-pos { display: none !important; }
        .goog-tooltip { display: none !important; }
        .goog-tooltip:hover { display: none !important; }
        .goog-text-highlight { background-color: transparent !important; border: none !important; box-shadow: none !important; }
        .goog-te-balloon-frame { display: none !important; }
        
        /* Custom scrollbar for the dropdown */
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}</style>
    </div>
  );
}
