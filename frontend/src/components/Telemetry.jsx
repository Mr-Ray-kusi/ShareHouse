import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { emitTelemetry, startErrorTracking, startWebVitals } from '../telemetry';

let started = false;

export default function Telemetry() {
  const location = useLocation();

  useEffect(() => {
    if (started) return undefined;
    started = true;
    startErrorTracking();
    startWebVitals();
    return undefined;
  }, []);

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
