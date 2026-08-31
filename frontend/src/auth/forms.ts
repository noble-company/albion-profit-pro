import { z } from 'zod'

const passwordSchema = z.string().min(10, 'Use pelo menos 10 caracteres.')

export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
})

export const registrationSchema = z
  .object({
    email: z.email('Informe um e-mail válido.'),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, 'Confirme sua senha.'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'As senhas precisam ser iguais.',
  })
  .refine(
    (data) => !data.password.toLowerCase().includes(data.email.toLowerCase()),
    {
      path: ['password'],
      message: 'A senha não pode conter o e-mail inteiro.',
    },
  )

export type LoginValues = z.infer<typeof loginSchema>
export type RegistrationValues = z.infer<typeof registrationSchema>
