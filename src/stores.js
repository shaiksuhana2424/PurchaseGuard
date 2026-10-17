export const STORES = [
  { id: "amazon", name: "Amazon", domain: "amazon.in", aliases: ["amazon", "amazon.in"], search: q => `https://www.amazon.in/s?k=${encodeURIComponent(q)}` },
  { id: "flipkart", name: "Flipkart", domain: "flipkart.com", aliases: ["flipkart", "flipkart.com"], search: q => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}` },
  { id: "myntra", name: "Myntra", domain: "myntra.com", aliases: ["myntra", "myntra.com"], search: q => `https://www.myntra.com/${encodeURIComponent(q).replaceAll("%20", "-")}` },
  { id: "meesho", name: "Meesho", domain: "meesho.com", aliases: ["meesho", "meesho.com"], search: q => `https://www.meesho.com/search?q=${encodeURIComponent(q)}` },
  { id: "croma", name: "Croma", domain: "croma.com", aliases: ["croma", "croma.com"], search: q => `https://www.croma.com/search/?text=${encodeURIComponent(q)}` },
  { id: "reliance-digital", env: "RELIANCE_DIGITAL", name: "Reliance Digital", domain: "reliancedigital.in", aliases: ["reliance digital", "reliancedigital.in"], search: q => `https://www.reliancedigital.in/search?q=${encodeURIComponent(q)}` },
  { id: "vijay-sales", env: "VIJAY_SALES", name: "Vijay Sales", domain: "vijaysales.com", aliases: ["vijay sales", "vijaysales.com"], search: q => `https://www.vijaysales.com/search/${encodeURIComponent(q)}` },
  { id: "tata-cliq", env: "TATA_CLIQ", name: "Tata CLiQ", domain: "tatacliq.com", aliases: ["tata cliq", "tatacliq.com"], search: q => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(q)}` },
  { id: "ajio", name: "AJIO", domain: "ajio.com", aliases: ["ajio", "ajio.com"], search: q => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}` },
  { id: "nykaa", name: "Nykaa", domain: "nykaa.com", aliases: ["nykaa", "nykaa.com"], search: q => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}` },
  { id: "jiomart", name: "JioMart", domain: "jiomart.com", aliases: ["jiomart", "jio mart", "jiomart.com"], search: q => `https://www.jiomart.com/search/${encodeURIComponent(q)}` }
];
export function envPrefix(store) { return store.env || store.id.toUpperCase().replaceAll("-", "_"); }
