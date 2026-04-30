/**
 * Utilitário de CNPJ — TC1-API-04
 * Valida formato e dígito verificador (Receita Federal).
 * V1: sem consulta externa — titularidade validada manualmente pelo admin.
 */

export function normalizeCnpj(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);

  if (cnpj.length !== 14) return false;

  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calcDigit(cnpj.substring(0, 12), w1);
  const d2 = calcDigit(cnpj.substring(0, 13), w2);

  return parseInt(cnpj[12], 10) === d1 && parseInt(cnpj[13], 10) === d2;
}
