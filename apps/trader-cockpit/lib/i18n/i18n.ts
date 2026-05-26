import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import resources from "./resources.json";

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "zh-CN";
  }

  const stored = window.localStorage.getItem("trader-cockpit.language");
  return stored === "en-US" || stored === "zh-CN" ? stored : "zh-CN";
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false,
    },
  });
}

export { i18n };
