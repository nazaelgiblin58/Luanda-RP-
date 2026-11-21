/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HourlyForecastSlot,
  WeatherForecastData,
  WeatherMode,
  WeatherTelemetry,
  WeatherType,
} from '../src/game/types.ts';

// Coordenadas reais de Luanda, Angola
const LUANDA_LAT = -8.8383;
const LUANDA_LON = 13.2344;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

let cachedTelemetry: {
  current: WeatherTelemetry;
  hourly: HourlyForecastSlot[];
  fetchedAt: number;
} | null = null;

function describeWmoCode(code: number): string {
  if (code === 0) return 'Céu Limpo';
  if (code === 1) return 'Poucas Nuvens';
  if (code === 2) return 'Parcialmente Nublado';
  if (code === 3) return 'Encoberto / Nebulosidade';
  if (code === 45 || code === 48) return 'Cacimbo / Neblina Costeira';
  if (code >= 51 && code <= 57) return 'Chuvisco Tropical';
  if (code >= 61 && code <= 67) return 'Chuva em Luanda';
  if (code >= 80 && code <= 82) return 'Aguaceiros Tropicais';
  if (code >= 95) return 'Trovoada & Chuva Forte';
  return 'Clima Tropical de Luanda';
}

export function resolveWeatherFromConditions(
  params: {
    weatherCode: number;
    cloudCover: number;
    precipMm: number;
    tempC: number;
    feelsLikeC?: number;
  },
  timeOfDay: number
): WeatherType {
  const { weatherCode, cloudCover, precipMm, tempC, feelsLikeC } = params;
  const effectiveTemp = typeof feelsLikeC === 'number' ? Math.max(tempC, feelsLikeC) : tempC;
  const isNight = timeOfDay >= 19.4 || timeOfDay < 5.5;
  const isSunset = timeOfDay >= 17.2 && timeOfDay < 19.4;

  // 1. Chuva ou Trovoada tem prioridade atmosférica
  if (
    precipMm >= 0.25 ||
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 99)
  ) {
    return 'chuva';
  }

  // 2. Cacimbo / Nevoeiro
  if (weatherCode === 45 || weatherCode === 48) {
    return 'cacimbo';
  }

  // 3. Nebulosidade elevada (>= 60% nuvens ou código WMO 3)
  if (weatherCode === 3 || cloudCover >= 60) {
    return 'nublado';
  }

  // 4. Calor Extremo diurno (>= 31.5°C ou sensação >= 33.5°C entre 09h e 17h)
  if (!isNight && !isSunset && timeOfDay >= 9.0 && (tempC >= 31.5 || effectiveTemp >= 33.5)) {
    return 'calor_extremo';
  }

  // 5. Ciclo diurno natural (Pôr-do-sol / Noite / Sol)
  if (isNight) return 'noite';
  if (isSunset) return 'pordosol';
  return 'ensolarado';
}

function buildFallbackTelemetry(timeOfDay: number, now = Date.now()): {
  current: WeatherTelemetry;
  hourly: HourlyForecastSlot[];
} {
  const hour = ((Math.floor(timeOfDay) % 24) + 24) % 24;
  // Curva térmica realista de Luanda (24°C madrugada -> 32.5°C tarde)
  const diurnalWave = Math.sin(((hour - 8) / 24) * Math.PI * 2);
  const tempC = Number((28.2 + diurnalWave * 4.3).toFixed(1));
  const humidity = Math.round(74 - diurnalWave * 12);
  const cloudCover = hour >= 16 && hour <= 19 ? 48 : hour >= 6 && hour <= 9 ? 36 : 24;
  const precipMm = 0;
  const weatherCode = cloudCover >= 60 ? 3 : cloudCover >= 30 ? 2 : 1;
  const feelsLikeC = Number((tempC + (humidity > 72 ? 2.4 : 1.1)).toFixed(1));
  const mappedWeather = resolveWeatherFromConditions(
    { weatherCode, cloudCover, precipMm, tempC, feelsLikeC },
    timeOfDay
  );

  const current: WeatherTelemetry = {
    tempC,
    feelsLikeC,
    humidity,
    cloudCover,
    precipMm,
    windKmh: 16.5,
    weatherCode,
    conditionLabel:
      mappedWeather === 'calor_extremo'
        ? 'Calor Extremo em Luanda'
        : describeWmoCode(weatherCode),
    mappedWeather,
    source: 'fallback',
    fetchedAt: now,
  };

  const hourly: HourlyForecastSlot[] = [];
  for (let i = 0; i < 6; i++) {
    const h = (hour + i) % 24;
    const wave = Math.sin(((h - 8) / 24) * Math.PI * 2);
    const hTemp = Number((28.2 + wave * 4.3).toFixed(1));
    const hCloud = h >= 16 && h <= 20 ? 55 : h === 13 || h === 14 ? 18 : 30;
    const hPrecip = 0;
    const hCode = hCloud >= 60 ? 3 : hCloud >= 30 ? 2 : 0;
    const hMapped = resolveWeatherFromConditions(
      { weatherCode: hCode, cloudCover: hCloud, precipMm: hPrecip, tempC: hTemp },
      h
    );
    hourly.push({
      hour: h,
      timeLabel: `${String(h).padStart(2, '0')}:00`,
      tempC: hTemp,
      cloudCover: hCloud,
      precipMm: hPrecip,
      weatherCode: hCode,
      mappedWeather: hMapped,
      conditionLabel:
        hMapped === 'calor_extremo' ? 'Calor Extremo' : describeWmoCode(hCode),
    });
  }

  return { current, hourly };
}

export async function fetchLuandaWeatherTelemetry(
  timeOfDay: number,
  forceRefresh = false
): Promise<{ current: WeatherTelemetry; hourly: HourlyForecastSlot[] }> {
  const now = Date.now();

  // Em testes automatizados ou sem rede, evita chamadas HTTP lentas externas
  if (process.env.LUANDA_TEST_MODE === '1') {
    const fb = buildFallbackTelemetry(timeOfDay, now);
    cachedTelemetry = { ...fb, fetchedAt: now };
    return fb;
  }

  if (!forceRefresh && cachedTelemetry && now - cachedTelemetry.fetchedAt < CACHE_TTL_MS) {
    // Recalcula mappedWeather conforme a hora atual do jogo mantendo dados reais da API
    const updatedCurrent: WeatherTelemetry = {
      ...cachedTelemetry.current,
      mappedWeather: resolveWeatherFromConditions(cachedTelemetry.current, timeOfDay),
    };
    return {
      current: updatedCurrent,
      hourly: cachedTelemetry.hourly,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${LUANDA_LAT}&longitude=${LUANDA_LON}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m` +
      `&hourly=temperature_2m,precipitation,weather_code,cloud_cover` +
      `&forecast_days=1&timezone=Africa%2FLuanda`;

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as any;
    const cur = data?.current;
    if (!cur) throw new Error('Resposta Open-Meteo incompleta');

    const tempC = Number(cur.temperature_2m ?? 28);
    const feelsLikeC = Number(cur.apparent_temperature ?? tempC + 1.5);
    const humidity = Math.round(Number(cur.relative_humidity_2m ?? 72));
    const cloudCover = Math.round(Number(cur.cloud_cover ?? 25));
    const precipMm = Number(cur.precipitation ?? 0);
    const windKmh = Number(cur.wind_speed_10m ?? 14);
    const weatherCode = Math.round(Number(cur.weather_code ?? 1));
    const mappedWeather = resolveWeatherFromConditions(
      { weatherCode, cloudCover, precipMm, tempC, feelsLikeC },
      timeOfDay
    );

    const current: WeatherTelemetry = {
      tempC,
      feelsLikeC,
      humidity,
      cloudCover,
      precipMm,
      windKmh,
      weatherCode,
      conditionLabel:
        mappedWeather === 'calor_extremo'
          ? 'Calor Extremo (Alerta Térmico)'
          : describeWmoCode(weatherCode),
      mappedWeather,
      source: 'open-meteo',
      fetchedAt: now,
    };

    const hourly: HourlyForecastSlot[] = [];
    const hTimes: string[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    const hTemps: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
    const hPrecips: number[] = Array.isArray(data?.hourly?.precipitation) ? data.hourly.precipitation : [];
    const hCodes: number[] = Array.isArray(data?.hourly?.weather_code) ? data.hourly.weather_code : [];
    const hClouds: number[] = Array.isArray(data?.hourly?.cloud_cover) ? data.hourly.cloud_cover : [];

    const startIdx = Math.max(0, Math.min(hTimes.length - 6, Math.floor(timeOfDay)));
    for (let i = 0; i < 6 && startIdx + i < hTimes.length; i++) {
      const idx = startIdx + i;
      const iso = String(hTimes[idx] || '');
      const hNum = Number(iso.slice(11, 13)) || (Math.floor(timeOfDay) + i) % 24;
      const ht = Number(hTemps[idx] ?? tempC);
      const hc = Math.round(Number(hClouds[idx] ?? cloudCover));
      const hp = Number(hPrecips[idx] ?? 0);
      const hcode = Math.round(Number(hCodes[idx] ?? weatherCode));
      const hMapped = resolveWeatherFromConditions(
        { weatherCode: hcode, cloudCover: hc, precipMm: hp, tempC: ht },
        hNum
      );
      hourly.push({
        hour: hNum,
        timeLabel: `${String(hNum).padStart(2, '0')}:00`,
        tempC: ht,
        cloudCover: hc,
        precipMm: hp,
        weatherCode: hcode,
        mappedWeather: hMapped,
        conditionLabel:
          hMapped === 'calor_extremo' ? 'Calor Extremo' : describeWmoCode(hcode),
      });
    }

    cachedTelemetry = { current, hourly, fetchedAt: now };
    return { current, hourly };
  } catch {
    if (cachedTelemetry) {
      return {
        current: {
          ...cachedTelemetry.current,
          mappedWeather: resolveWeatherFromConditions(cachedTelemetry.current, timeOfDay),
        },
        hourly: cachedTelemetry.hourly,
      };
    }
    const fb = buildFallbackTelemetry(timeOfDay, now);
    cachedTelemetry = { ...fb, fetchedAt: now };
    return fb;
  }
}

export function buildWeatherForecastResponse(
  activeWeather: WeatherType,
  mode: WeatherMode,
  telemetry: { current: WeatherTelemetry; hourly: HourlyForecastSlot[] }
): WeatherForecastData {
  return {
    locationName: 'Luanda, Angola',
    latitude: LUANDA_LAT,
    longitude: LUANDA_LON,
    mode,
    activeWeather,
    current: telemetry.current,
    hourly: telemetry.hourly,
  };
}
