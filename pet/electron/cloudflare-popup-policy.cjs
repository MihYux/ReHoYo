const CLOUDFLARE_NETWORK_SOURCES = new Set(["network", "http"]);

function cloudflarePopupDelivery(source, messageId) {
  if (
    !CLOUDFLARE_NETWORK_SOURCES.has(String(source || "")) ||
    typeof messageId !== "string" ||
    !messageId.trim()
  ) {
    return null;
  }
  return {
    source: "cloudflare",
    messageId: messageId.trim(),
  };
}

module.exports = {
  CLOUDFLARE_NETWORK_SOURCES,
  cloudflarePopupDelivery,
};
