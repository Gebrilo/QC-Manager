const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Generic API fetch wrapper
 */
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return {} as T;
    }

    return response.json();
}
