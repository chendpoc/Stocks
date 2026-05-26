import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import resources from "./resources.json";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "zh-CN",
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false,
    },
  });
}

export { i18n };
