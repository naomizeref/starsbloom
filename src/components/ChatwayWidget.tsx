import React, { useEffect } from "react";
import { useOrbit } from "../context/OrbitContext";
import { useLocation } from 'react-router-dom';
import { isPublicEntry } from '../lib/authPageLoader';

declare global {
  interface Window {
    __chatway_loaded_id?: string;
  }
}

export const ChatwayWidget: React.FC = () => {
  const { pathname } = useLocation();
  const defer = isPublicEntry(pathname);
  const { appSettings } = useOrbit();
  const widgetId = (appSettings.chatwayWidgetId || "vVN5iAZMVnWm").trim();

  useEffect(() => {
    if (!widgetId) return;

    // Give the auth form and Clerk priority on slow mobile connections.
    const timer = window.setTimeout(() => {

      // Prevent duplicate script injection and double initialization
      if (window.__chatway_loaded_id === widgetId && document.getElementById("chatway")) {
        // Remove any duplicate chatway container elements if present
        const containers = document.querySelectorAll("#chatway-widget-container, div[class*='chatway-widget']");
        if (containers.length > 1) {
          for (let i = 1; i < containers.length; i++) {
            containers[i].remove();
          }
        }
        return;
      }

      // If widget ID changed, clean up previous script and widget elements
      if (window.__chatway_loaded_id && window.__chatway_loaded_id !== widgetId) {
        const oldScript = document.getElementById("chatway");
        if (oldScript) oldScript.remove();
        document.querySelectorAll("[id*='chatway'], [class*='chatway']").forEach((el) => {
          if (el.tagName !== "SCRIPT") el.remove();
        });
      }

      const existingScript = document.getElementById("chatway") as HTMLScriptElement | null;
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "chatway";
        script.async = true;
        script.src = `https://cdn.chatway.app/widget.js?id=${widgetId}`;
        document.body.appendChild(script);
        window.__chatway_loaded_id = widgetId;
      }
    }, defer ? 3000 : 0);
    return () => window.clearTimeout(timer);
  }, [widgetId, defer]);

  return null;
};
