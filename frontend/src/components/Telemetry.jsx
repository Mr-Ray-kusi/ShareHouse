import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { emitTelemetry, startErrorTracking, startWebVitals } from '../telemetry';

let started = false;

export default function Telemetry() {
  const location = useLocation();
  const lastGtmPath = useRef('');

  useEffect(() => {
    if (started) return undefined;
    started = true;
    startErrorTracking();
    startWebVitals();
    return undefined;
  }, []);

  useEffect(() => {
    if (lastGtmPath.current === location.pathname) return;
    lastGtmPath.current = location.pathname;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'sharehouse_page_view',
      page_path: location.pathname,
      page_title: document.title,
    });
  }, [location.pathname]);

  useEffect(() => {
    emitTelemetry({
      name: 'page_view',
      path: `${location.pathname}${location.search || ''}`,
      channel: document.referrer ? 'referral' : 'direct',
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    });
  }, [location.pathname, location.search]);

  return null;
}
