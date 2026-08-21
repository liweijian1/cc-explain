import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const toolDefinitions: Anthropic.Tool[] = [
    {
        name: "read_file",
        description: "读取指定路径的文件内容。路径可以是相对当前工作目录的相对路径，或绝对路径。",
        input_schema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "要读取的文件路径",
                },
            },
            required: ["path"],
        },
    },
    {
        name: "get_weather",
        description: "查询指定城市的当前天气，包括气温、体感温度、湿度、风速和天气状况。",
        input_schema: {
            type: "object",
            properties: {
                city: {
                    type: "string",
                    description: "城市名称，例如：北京、Shanghai、Tokyo",
                },
            },
            required: ["city"],
        },
    },
];

export async function readFileTool(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    return await readFile(resolved, "utf8");
}

type GeoResult = {
    results?: Array<{
        name: string;
        country?: string;
        latitude: number;
        longitude: number;
        timezone?: string;
    }>;
};

type WeatherResult = {
    current?: {
        time: string;
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        weather_code: number;
    };
};

const WEATHER_CODE_LABELS: Record<number, string> = {
    0: "晴",
    1: "大部晴朗",
    2: "局部多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "中毛毛雨",
    55: "大毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "小阵雨",
    81: "中阵雨",
    82: "大阵雨",
    95: "雷阵雨",
};

export async function getWeatherTool(city: string): Promise<string> {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", city);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "zh");

    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) {
        throw new Error(`地理编码请求失败: ${geoResponse.status}`);
    }

    const geo = (await geoResponse.json()) as GeoResult;
    const place = geo.results?.[0];
    if (!place) {
        throw new Error(`找不到城市: ${city}`);
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(place.latitude));
    weatherUrl.searchParams.set("longitude", String(place.longitude));
    weatherUrl.searchParams.set(
        "current",
        "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
    );
    weatherUrl.searchParams.set("timezone", place.timezone ?? "auto");

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) {
        throw new Error(`天气请求失败: ${weatherResponse.status}`);
    }

    const weather = (await weatherResponse.json()) as WeatherResult;
    const current = weather.current;
    if (!current) {
        throw new Error("天气接口未返回当前数据");
    }

    const condition = WEATHER_CODE_LABELS[current.weather_code] ?? `天气码 ${current.weather_code}`;
    const location = place.country ? `${place.name}, ${place.country}` : place.name;

    return [
        `地点: ${location}`,
        `时间: ${current.time}`,
        `天气: ${condition}`,
        `气温: ${current.temperature_2m}°C`,
        `体感: ${current.apparent_temperature}°C`,
        `湿度: ${current.relative_humidity_2m}%`,
        `风速: ${current.wind_speed_10m} km/h`,
    ].join("\n");
}

export async function executeTool(name: string, input: unknown): Promise<string> {
    if (name === "read_file") {
        const filePath = (input as { path?: string }).path;
        if (!filePath) {
            throw new Error("缺少 path 参数");
        }
        return await readFileTool(filePath);
    }
    if (name === "get_weather") {
        const city = (input as { city?: string }).city;
        if (!city) {
            throw new Error("缺少 city 参数");
        }
        return await getWeatherTool(city);
    }
    throw new Error(`未知工具: ${name}`);
}
