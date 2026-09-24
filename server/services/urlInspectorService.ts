/**
 * URL Inspection and Web Content Extraction Service
 * Allows Kofi to inspect web links, read agricultural policy bulletins, and summarize articles safely.
 */

export interface UrlInspectionResult {
  url: string;
  title: string;
  description: string;
  extractedText: string;
  isAccessible: boolean;
  status: number;
}

export class UrlInspectorService {
  /**
   * Safely inspect and extract content from a URL
   */
  public static async inspectUrl(targetUrl: string): Promise<UrlInspectionResult> {
    try {
      // Validate protocol
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          url: targetUrl,
          title: 'Invalid URL',
          description: 'Only HTTP and HTTPS URLs are supported.',
          extractedText: '',
          isAccessible: false,
          status: 400,
        };
      }

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GHarvest-Kofi-Inspector/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
      clearTimeout(timeoutId);

      const html = await res.text();

      // Extract basic metadata using regex
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
      const description = descMatch ? descMatch[1].trim() : '';

      // Clean HTML tags to text
      let text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Limit length to ~2500 characters for LLM digestion
      const extractedText = text.slice(0, 2500);

      return {
        url: targetUrl,
        title,
        description,
        extractedText,
        isAccessible: true,
        status: res.status,
      };
    } catch (err: any) {
      return {
        url: targetUrl,
        title: 'Unable to connect to website',
        description: err.message || 'Connection timed out or host unreachable.',
        extractedText: `Could not retrieve live contents for ${targetUrl}. The external server did not respond in time or blocked automated access.`,
        isAccessible: false,
        status: 504,
      };
    }
  }
}
