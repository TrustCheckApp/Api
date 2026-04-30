import { isValidCnpj, normalizeCnpj } from './cnpj.util';

describe('isValidCnpj', () => {
  it('aceita CNPJ válido formatado', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('aceita CNPJ válido apenas dígitos', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-00')).toBe(false);
  });

  it('rejeita CNPJ com comprimento inválido', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('112223330001810')).toBe(false);
  });

  it('rejeita sequências de dígitos idênticos', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(isValidCnpj('')).toBe(false);
  });

  it('aceita CNPJ com pontuação variada', () => {
    expect(isValidCnpj('11222333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222333000181')).toBe(true);
  });
});

describe('normalizeCnpj', () => {
  it('remove pontuação', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });

  it('mantém apenas dígitos', () => {
    expect(normalizeCnpj('11222333000181')).toBe('11222333000181');
  });
});
