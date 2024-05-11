import { Prisma, PrismaClient } from "@prisma/client";
import { uuidv7Extension } from "../dist"
import { assert } from "console";

const prisma = new PrismaClient().$extends(uuidv7Extension({dmmf: Prisma.dmmf }))

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `test+${Math.floor(Math.random() * 10000)}@email.com`,
      name: 'Test User',
    }
  })

  assert(user.id.split('-')[2][0] === '7')

  console.log({ user })
}

main()
