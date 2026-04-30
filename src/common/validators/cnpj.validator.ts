import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Valida CNPJ — formato e dígito verificador.
 * Aceita: "12.345.678/0001-99" ou "12345678000199"
 * R2: V1 valida apenas formato + dígito; titularidade real fica em fluxo manual auditável.
 */
@ValidatorConstraint({ name: 'IsCnpj', async: false })
export class IsCnpjConstraint implements ValidatorConstraintInterface {
  validate(raw: string): boolean {
    if (!raw) return false;

    const cnpj = raw.replace(/[^\d]/g, '');

    if (cnpj.length !== 14) return false;

    // Rejeita sequências idênticas (ex: 11111111111111)
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const calcDigito = (base: string, pesos: number[]): number => {
      const soma = base
        .split('')
        .reduce((acc, d, i) => acc + parseInt(d, 10) * pesos[i], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };

    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const d1 = calcDigito(cnpj.substring(0, 12), pesos1);
    const d2 = calcDigito(cnpj.substring(0, 13), pesos2);

    return (
      parseInt(cnpj[12], 10) === d1 &&
      parseInt(cnpj[13], 10) === d2
    );
  }

  defaultMessage(): string {
    return 'CNPJ inválido';
  }
}

export function IsCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCnpjConstraint,
    });
  };
}

/**
 * Normaliza CNPJ removendo pontuação.
 * Usar em conjunto com @Transform do class-transformer antes de salvar no banco.
 */
export function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/[^\d]/g, '');
}
