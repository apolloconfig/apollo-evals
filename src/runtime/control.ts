import type { ApolloRequestRecord } from '../core/types.js';

type FetchOptions = { method?: string; body?: unknown; headers?: Record<string, string>; auth?: 'session' | 'bearer' | 'none' };

function segment(value: string): string { return encodeURIComponent(value); }

export class ApolloControlClient {
  private cookie = '';
  constructor(
    public readonly portalUrl: string,
    public readonly configServiceUrl: string,
    private readonly observer?: ApolloRequestRecord[],
  ) {}

  async login(username = 'apollo', password = 'admin'): Promise<void> {
    const response = await fetch(`${this.portalUrl}/signin`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie || (response.status !== 302 && response.status !== 200)) throw new Error(`Portal login failed: ${response.status}`);
    this.cookie = setCookie.split(';', 1)[0]!;
  }

  clearSession(): void { this.cookie = ''; }

  async request<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if ((options.auth ?? 'session') === 'session') headers.cookie = this.cookie;
    const started = new Date().toISOString();
    const response = await fetch(`${this.portalUrl}${path}`, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.observer?.push({ timestamp: started, method: options.method ?? 'GET', path, status: response.status, authType: headers.cookie ? 'cookie' : headers.authorization ? 'bearer' : 'none' });
    const text = await response.text();
    if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${text.slice(0, 500)}`);
    if (!text) return undefined as T;
    try { return JSON.parse(text) as T; } catch { return text as T; }
  }

  async createApp(appId: string, name = appId): Promise<void> {
    await this.request('/apps', { method: 'POST', body: { appId, name, orgId: 'TEST1', orgName: '样例部门1', ownerName: 'apollo', admins: ['apollo'] } });
  }

  async createUserToken(name: string, appIds: string[]): Promise<string> {
    const result = await this.request<{ tokenValue: string }>('/openapi/v1/user-tokens', { method: 'POST', body: { name, appIds, envs: ['LOCAL'] } });
    return result.tokenValue;
  }

  namespacePath(appId: string, namespace = 'application'): string {
    return `/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/default/namespaces/${segment(namespace)}`;
  }

  async createAppNamespace(appId: string, namespace: string, format: string): Promise<void> {
    await this.request(`/openapi/v1/apps/${segment(appId)}/appnamespaces`, { method: 'POST', body: { name: namespace, appId, format, isPublic: false, appendNamespacePrefix: true, comment: 'apollo-evals' } });
  }

  async createNamespace(appId: string, namespace: string): Promise<void> {
    try { await this.request('/openapi/v1/namespaces', { method: 'POST', body: [{ appId, env: 'LOCAL', clusterName: 'default', appNamespaceName: namespace }] }); }
    catch (error) {
      if (!String(error).includes('create namespace failed for')) throw error;
      await this.request(`${this.namespacePath(appId, namespace)}?fillItemDetail=false`);
    }
  }

  async createCluster(appId: string, clusterName: string): Promise<void> {
    await this.request(`/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters?operator=apollo`, { method: 'POST', body: { appId, name: clusterName, dataChangeCreatedBy: 'apollo', dataChangeLastModifiedBy: 'apollo' } });
  }

  async createNamespaceInCluster(appId: string, clusterName: string, namespace: string): Promise<void> {
    try { await this.request('/openapi/v1/namespaces', { method: 'POST', body: [{ appId, env: 'LOCAL', clusterName, appNamespaceName: namespace }] }); }
    catch (error) {
      if (!String(error).includes('create namespace failed for')) throw error;
      await this.request(`/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/${segment(clusterName)}/namespaces/${segment(namespace)}?fillItemDetail=false`);
    }
  }

  async putItem(appId: string, namespace: string, key: string, value: string, type = 0): Promise<void> {
    const path = `${this.namespacePath(appId, namespace)}/items/${segment(key)}?createIfNotExists=true&operator=apollo`;
    const body = { key, value, type, dataChangeCreatedBy: 'apollo', dataChangeLastModifiedBy: 'apollo' };
    try { await this.request(path, { method: 'PUT', body }); }
    catch (error) {
      if (!/\b404\b/.test(String(error))) throw error;
      await this.request(`${this.namespacePath(appId, namespace)}/items?operator=apollo`, { method: 'POST', body });
    }
  }

  async putItemInCluster(appId: string, clusterName: string, namespace: string, key: string, value: string, type = 0): Promise<void> {
    const base = `/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/${segment(clusterName)}/namespaces/${segment(namespace)}`;
    const body = { key, value, type, dataChangeCreatedBy: 'apollo', dataChangeLastModifiedBy: 'apollo' };
    try { await this.request(`${base}/items/${segment(key)}?createIfNotExists=true&operator=apollo`, { method: 'PUT', body }); }
    catch (error) {
      if (!/\b404\b/.test(String(error))) throw error;
      await this.request(`${base}/items?operator=apollo`, { method: 'POST', body });
    }
  }

  async deleteItem(appId: string, namespace: string, key: string): Promise<void> {
    await this.request(`${this.namespacePath(appId, namespace)}/items/${segment(key)}?operator=apollo`, { method: 'DELETE' });
  }

  async putText(appId: string, namespace: string, configText: string): Promise<void> {
    const extension = namespace.includes('.') ? namespace.slice(namespace.lastIndexOf('.') + 1) : 'properties';
    await this.request(`${this.namespacePath(appId, namespace)}/items?operator=apollo`, { method: 'PUT', body: { appId, env: 'LOCAL', clusterName: 'default', namespaceName: namespace, format: extension, configText, operator: 'apollo' } });
  }

  async release(appId: string, namespace: string, title: string): Promise<Record<string, unknown>> {
    return await this.request(`${this.namespacePath(appId, namespace)}/releases?operator=apollo`, { method: 'POST', body: { releaseTitle: title, releaseComment: 'apollo-evals', releasedBy: 'apollo', isEmergencyPublish: false } });
  }

  async rollback(releaseId: number, toReleaseId?: number): Promise<void> {
    const suffix = toReleaseId === undefined ? '' : `&toReleaseId=${toReleaseId}`;
    await this.request(`/openapi/v1/envs/LOCAL/releases/${releaseId}/rollback?operator=apollo${suffix}`, { method: 'PUT' });
  }

  async items(appId: string, namespace = 'application'): Promise<Array<{ key: string; value: string; type: number }>> {
    try {
      const page = await this.request<{ content: Array<{ key: string; value: string; type: number }> }>(`${this.namespacePath(appId, namespace)}/items?page=0&size=500`);
      return page.content ?? [];
    } catch (error) { if (String(error).includes('404')) return []; throw error; }
  }

  async latestRelease(appId: string, namespace = 'application'): Promise<Record<string, unknown> | null> {
    try { return await this.request<Record<string, unknown>>(`${this.namespacePath(appId, namespace)}/releases/latest`); } catch (error) {
      if (String(error).includes('404')) return null;
      throw error;
    }
  }

  async activeReleases(appId: string, namespace = 'application'): Promise<Array<Record<string, unknown>>> {
    const page = await this.request<{ content: Array<Record<string, unknown>> }>(`${this.namespacePath(appId, namespace)}/releases/active?page=0&size=100`);
    return page.content ?? [];
  }

  async itemsInCluster(appId: string, clusterName: string, namespace = 'application'): Promise<Array<{ key: string; value: string; type: number }>> {
    const page = await this.request<{ content: Array<{ key: string; value: string; type: number }> }>(`/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/${segment(clusterName)}/namespaces/${segment(namespace)}/items?page=0&size=500`);
    return page.content ?? [];
  }

  async releaseInCluster(appId: string, clusterName: string, namespace: string, title: string): Promise<Record<string, unknown>> {
    return await this.request(`/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/${segment(clusterName)}/namespaces/${segment(namespace)}/releases?operator=apollo`, { method: 'POST', body: { releaseTitle: title, releaseComment: 'apollo-evals', releasedBy: 'apollo', isEmergencyPublish: false } });
  }

  async latestReleaseInCluster(appId: string, clusterName: string, namespace = 'application'): Promise<Record<string, unknown> | null> {
    try { return await this.request(`/openapi/v1/envs/LOCAL/apps/${segment(appId)}/clusters/${segment(clusterName)}/namespaces/${segment(namespace)}/releases/latest`); } catch (error) {
      if (String(error).includes('404')) return null;
      throw error;
    }
  }

  async appNamespaces(appId: string): Promise<Array<Record<string, unknown>>> {
    return await this.request(`/openapi/v1/apps/${segment(appId)}/appnamespaces`);
  }

  async config(appId: string, namespace = 'application'): Promise<Record<string, string>> {
    const response = await fetch(`${this.configServiceUrl}/configs/${segment(appId)}/default/${segment(namespace)}`);
    if (response.status === 404) return {};
    if (!response.ok) throw new Error(`Config Service read failed: ${response.status}`);
    const body = await response.json() as { configurations: Record<string, string> };
    return body.configurations;
  }
}
