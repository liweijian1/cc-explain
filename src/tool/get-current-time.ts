import type Anthropic from "@anthropic-ai/sdk";

export const getCurrentTimeToolDefinition: Anthropic.Tool = {
    name: "get_current_time",
    description: "获取指定城市或 IANA 时区的当前当地时间，包括年、月、日、时、分、秒和时区偏移。",
    input_schema: {
        type: "object",
        properties: {
            city: {
                type: "string",
                description: "城市名称或 IANA 时区，例如：北京、Shanghai、Tokyo、Asia/Shanghai、America/New_York",
            },
        },
        required: ["city"],
    },
};

type GeoResult = {
    results?: Array<{
        name: string;
        country?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
        population?: number;
    }>;
};

type GeoPlace = NonNullable<GeoResult["results"]>[number];

// Open-Meteo 的中文检索会漏掉或错配这些城市，先改写成英文再查询。
const CITY_QUERY_ALIASES: Record<string, string> = {
    纽约: "New York",
    伦敦: "London",
    东京: "Tokyo",
    首尔: "Seoul",
    洛杉矶: "Los Angeles",
};

function isValidTimeZone(timeZone: string): boolean {
    try {
        Intl.DateTimeFormat("zh-CN", { timeZone });
        return true;
    } catch {
        return false;
    }
}

function hasCjk(text: string): boolean {
    return /[\u3400-\u9fff]/.test(text);
}

async function searchCities(name: string, language: "zh" | "en"): Promise<GeoPlace[]> {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", name);
    geoUrl.searchParams.set("count", "5");
    geoUrl.searchParams.set("language", language);

    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) {
        throw new Error(`地理编码请求失败: ${geoResponse.status}`);
    }

    const geo = (await geoResponse.json()) as GeoResult;
    return geo.results ?? [];
}

function pickBestPlace(places: GeoPlace[]): GeoPlace | undefined {
    const withTimeZone = places.filter((place) => place.timezone && isValidTimeZone(place.timezone));
    return withTimeZone.reduce<GeoPlace | undefined>((best, place) => {
        if (!best) return place;
        return (place.population ?? 0) > (best.population ?? 0) ? place : best;
    }, undefined);
}

async function resolveTimeZone(query: string): Promise<{ location: string; timeZone: string }> {
    const trimmed = query.trim();
    if (!trimmed) {
        throw new Error("缺少地区或时区");
    }

    if (isValidTimeZone(trimmed)) {
        return { location: trimmed, timeZone: trimmed };
    }

    const searchName = CITY_QUERY_ALIASES[trimmed] ?? trimmed;
    const primaryLanguage = hasCjk(searchName) ? "zh" : "en";
    const fallbackLanguage = primaryLanguage === "zh" ? "en" : "zh";

    let place = pickBestPlace(await searchCities(searchName, primaryLanguage));
    if (!place) {
        place = pickBestPlace(await searchCities(searchName, fallbackLanguage));
    }
    if (!place?.timezone) {
        throw new Error(`找不到城市或时区: ${trimmed}`);
    }

    const location = place.country ? `${place.name}, ${place.country}` : place.name;
    return { location, timeZone: place.timezone };
}

function formatLocalTime(timeZone: string, date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZoneName: "longOffset",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";

    return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")} (${value("timeZoneName")})`;
}

export async function getCurrentTimeTool(city: string): Promise<string> {
    const { location, timeZone } = await resolveTimeZone(city);
    return [
        `地点: ${location}`,
        `时区: ${timeZone}`,
        `当前时间: ${formatLocalTime(timeZone)}`,
    ].join("\n");
}
