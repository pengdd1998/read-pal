import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse } from '@read-pal/shared';

const API_URL = __DEV__
  ? 'http://localhost:3001'
  : 'https://api.read-pal.com';

const TOKEN_KEY = 'auth_token';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiResponse>) => {
        if (error.response?.status === 401) {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
        return Promise.reject(error);
      },
    );
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const res = await this.client.get<ApiResponse<T>>(url, { params });
    return res.data;
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const res = await this.client.post<ApiResponse<T>>(url, data);
    return res.data;
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const res = await this.client.put<ApiResponse<T>>(url, data);
    return res.data;
  }

  async patch<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    const res = await this.client.patch<ApiResponse<T>>(url, data);
    return res.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const res = await this.client.delete<ApiResponse<T>>(url);
    return res.data;
  }

  async upload<T>(url: string, formData: FormData): Promise<ApiResponse<T>> {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const res = await this.client.post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return res.data;
  }
}

export const api = new ApiClient();
export const API_BASE_URL = API_URL;
