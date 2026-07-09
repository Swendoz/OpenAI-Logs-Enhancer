(function () {
    if (window.__OLE_INJECTED__) return;
    window.__OLE_INJECTED__ = true;

    function isTargetUrl(url) {
      if (typeof url !== "string") return false;
      return (
        url.includes("/v1/dashboard/chat/completions") ||
        url.includes("/v1/dashboard/responses") ||
        url.includes("/v1/responses")
      );
    }
  
    function safeParseJson(text) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
  
    function normalizeUsage(usage) {
      if (!usage || typeof usage !== "object") {
        return { inTok: null, outTok: null, totalTok: null, cachedTok: null, reasoningTok: null };
      }

      const inTok = usage.prompt_tokens ?? usage.input_tokens ?? null;
      const outTok = usage.completion_tokens ?? usage.output_tokens ?? null;

      let totalTok = usage.total_tokens ?? null;
      if (totalTok == null && inTok != null && outTok != null) totalTok = inTok + outTok;

      const cachedTok = usage.input_tokens_details?.cached_tokens ?? usage.cache_read_tokens ?? null;
      const reasoningTok = usage.output_tokens_details?.reasoning_tokens ?? null;

      return { inTok, outTok, totalTok, cachedTok, reasoningTok };
    }
  
    function postRecordsFromJson(json) {
      const rows = Array.isArray(json?.data) ? json.data : [];
      if (!rows.length) return;

      const records = rows
        .map((row) => {
          const id = row?.id || null;
          const requestId = row?.request_id || null;

          if (!id && !requestId) return null;

          return {
            id,
            requestId,
            usage: normalizeUsage(row.usage),
            temperature: typeof row.temperature === "number" ? row.temperature : null,
            presencePenalty: typeof row.presence_penalty === "number" ? row.presence_penalty : null,
            frequencyPenalty: typeof row.frequency_penalty === "number" ? row.frequency_penalty : null,
            metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null
          };
        })
        .filter(Boolean);

      if (!records.length) return;

      window.postMessage({ type: "OLE_DASHBOARD_CHAT_COMPLETIONS_BATCH", payload: { records } }, "*");
    }
  
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (isTargetUrl(url)) {
          const clone = response.clone();
          clone
            .text()
            .then((text) => {
              const json = safeParseJson(text);
              if (json) postRecordsFromJson(json);
            })
            .catch(() => {});
        }
      } catch {}

      return response;
    };
  
    const OriginalXHR = window.XMLHttpRequest;
  
    function PatchedXHR() {
      const xhr = new OriginalXHR();
      let requestUrl = "";

      const originalOpen = xhr.open;
      xhr.open = function (method, url, ...rest) {
        requestUrl = url;
        return originalOpen.call(this, method, url, ...rest);
      };

      xhr.addEventListener("load", function () {
        try {
          if (!isTargetUrl(requestUrl)) return;
          const contentType = xhr.getResponseHeader("content-type") || "";
          if (!contentType.includes("application/json")) return;

          const json = safeParseJson(xhr.responseText);
          if (json) postRecordsFromJson(json);
        } catch {}
      });

      return xhr;
    }
  
    window.XMLHttpRequest = PatchedXHR;
  })();
  