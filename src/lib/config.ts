const NETWORK = import.meta.env.VITE_NETWORK as "mainnet" | "mumbai";
const DONATION_ADDRESS = import.meta.env.VITE_DONATION_ADDRESS;
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS as string;

const POLYGON_CHAIN_ID = NETWORK === "mainnet" ? 137 : 80001;

const API_URL = import.meta.env.VITE_API_URL;
const WISHING_WELL_CONTRACT = import.meta.env.VITE_WISHING_WELL_CONTRACT;
const ACCOUNT_MINTER_CONTRACT = import.meta.env.VITE_ACCOUNT_MINTER_CONTRACT;
const FARM_CONTRACT = import.meta.env.VITE_FARM_CONTRACT;
const INVENTORY_CONTRACT = import.meta.env.VITE_INVENTORY_CONTRACT;
const PAIR_CONTRACT = import.meta.env.VITE_PAIR_CONTRACT;
const SESSION_CONTRACT = import.meta.env.VITE_SESSION_CONTRACT;
const TOKEN_CONTRACT = import.meta.env.VITE_TOKEN_CONTRACT;
const DISCORD_REDIRECT = import.meta.env.VITE_DISCORD_REDIRECT;
const CLIENT_VERSION = import.meta.env.VITE_CLIENT_VERSION as string;
const RELEASE_VERSION = import.meta.env.VITE_RELEASE_VERSION as string;
const RECAPTCHA_SITEKEY = import.meta.env.VITE_RECAPTCHA_SITEKEY as string;
const CLOUDFLARE_CAPTCHA_SITEKEY = import.meta.env
  .VITE_CLOUDFLARE_CAPTCHA_SITEKEY as string;
const TRADER_CONTRACT = import.meta.env.VITE_TRADER_CONTRACT as string;
const FROG_CONTRACT = import.meta.env.VITE_FROG_CONTRACT as string;
const FROG_DONATION = import.meta.env.VITE_FROG_DONATION as string;
const BUMPKIN_DETAILS_CONTRACT = import.meta.env
  .VITE_BUMPKIN_DETAILS_CONTRACT as string;
const BUMPKIN_ITEMS_CONTRACT = import.meta.env
  .VITE_BUMPKIN_ITEMS_CONTRACT as string;
export const CONFIG = {
  NETWORK,
  POLYGON_CHAIN_ID,
  DONATION_ADDRESS,
  TREASURY_ADDRESS,
  API_URL,
  DISCORD_REDIRECT,

  WISHING_WELL_CONTRACT,
  ACCOUNT_MINTER_CONTRACT,
  FARM_CONTRACT,
  INVENTORY_CONTRACT,
  PAIR_CONTRACT,
  SESSION_CONTRACT,
  TOKEN_CONTRACT,
  CLIENT_VERSION,
  RELEASE_VERSION,
  RECAPTCHA_SITEKEY,
  CLOUDFLARE_CAPTCHA_SITEKEY,
  TRADER_CONTRACT,
  FROG_CONTRACT,
  FROG_DONATION,
  BUMPKIN_DETAILS_CONTRACT,
  BUMPKIN_ITEMS_CONTRACT,
};
