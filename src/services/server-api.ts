// Network integrations to chathub.gg are disabled in this fork.
// Provide lightweight stubs to avoid any remote calls while keeping types intact.

export async function decodePoeFormkey(_html: string): Promise<string> {
  return ''
}

type ActivateResponse =
  | {
      activated: true
      instance: { id: string }
      meta: { product_id: number }
    }
  | { activated: false; error: string }

export async function activateLicense(_key: string, _instanceName: string) {
  return { activated: false, error: 'disabled' } as ActivateResponse
}

interface Product {
  price: number
}

export async function fetchPremiumProduct(): Promise<Product> {
  return { price: 0 }
}

export async function createDiscount(): Promise<{ code: string; startTime: number }> {
  return { code: '', startTime: 0 }
}

export interface Discount {
  code: string
  startTime: number
  price: number
  percent: number
}

export interface Campaign {
  description: string
  code: string
  price: number
}

interface PurchaseInfo {
  price: number
  discount?: Discount
  campaign?: Campaign
}

export async function fetchPurchaseInfo(): Promise<PurchaseInfo> {
  return { price: 0 }
}

export async function checkDiscount(
  _params: { appOpenTimes: number; premiumModalOpenTimes: number },
): Promise<{ show: boolean; campaign?: Campaign }> {
  return { show: false }
}
