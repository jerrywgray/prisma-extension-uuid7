import { Prisma } from "@prisma/client/extension";
import { uuidv7 } from "uuidv7";

import type { DMMF, BaseDMMF } from "@prisma/client/runtime/library";

type AugmentedField = DMMF.Field & { isGenUuid: boolean };

type AugmentedFieldData = {
  fields: Record<string, AugmentedField>;
  genUuidFields: Record<string, AugmentedField>;
};

type PrismaModelWithFieldMap = Omit<DMMF.Model, "fields"> & AugmentedFieldData;

const getModelMap = (models: DMMF.Model[]) => {
  const clonedModels = structuredClone(models);
  return clonedModels.reduce((updatedModels, model) => {
    const { fields, genUuidFields } = model.fields.reduce(
      (fieldsList, field) => {
        const isGenUuid =
          typeof field.default === "object" &&
          !Array.isArray(field.default) &&
          "args" in field.default &&
          ((typeof field.default.args[0] === "string" &&
            field.default.args[0] === "gen_random_uuid()") ||
            field.default.name === "uuid");

        const updatedField = {
          ...field,
          isGenUuid,
        };
        if (isGenUuid) {
          fieldsList.genUuidFields[field.name] = updatedField;
        }
        fieldsList.fields[field.name] = updatedField;
        return fieldsList;
      },
      { fields: {}, genUuidFields: {} } as AugmentedFieldData
    );

    updatedModels[model.name] = model as unknown as PrismaModelWithFieldMap;
    updatedModels[model.name].fields = fields;
    updatedModels[model.name].genUuidFields = genUuidFields;

    return updatedModels;
  }, {} as Record<string, PrismaModelWithFieldMap>);
};

const updateCreateFields =
  (modelMap: Record<string, PrismaModelWithFieldMap>) =>
  ({
    operation,
    model,
    data,
  }: {
    operation: "create" | "createMany" | "update" | "updateMany";
    model: PrismaModelWithFieldMap;
    data: Record<string, unknown>;
  }) => {
    if (!data || !model) {
      return {} as Record<string, unknown>;
    }

    let newData: Record<string, unknown> = { ...data };

    for (const key in newData) {
      const field = model.fields[key];
      let value = newData[key];
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value) && !field.isList) {
          value = value.map((item) => {
            return updateCreateFields(modelMap)({
              operation,
              model,
              data: item as Record<string, unknown>,
            });
          });
        } else {
          if (
            field?.kind === "object" &&
            "create" in value &&
            typeof value.create === "object" &&
            value.create
          ) {
            value.create = updateCreateFields(modelMap)({
              operation,
              model: modelMap[field.type],
              data: value.create as Record<string, unknown>,
            });
          } else if (field?.kind === "object" && "createMany" in value) {
            if (
              typeof value.createMany === "object" &&
              value.createMany &&
              "data" in value.createMany &&
              Array.isArray(value.createMany.data)
            ) {
              console.log({
                msg: `Updating createMany fields for ${key} on ${model.name}`,
              });
              value.createMany.data = value.createMany.data.map((item) => {
                return updateCreateFields(modelMap)({
                  operation: "create",
                  model: modelMap[field.type],
                  data: item as Record<string, unknown>,
                });
              });
            }
          }
        }
        newData[key] = value;
      }
    }

    if (operation === "create" || operation === "createMany") {
      for (const field of Object.values(model.genUuidFields)) {
        if (!data[field.name]) {
          console.log({
            msg: `Generating uuidv7 for ${field.name} on ${model.name}`,
          });
          newData = {
            ...newData,
            [field.name]: uuidv7(),
          };
        }
      }
    }

    return newData;
  };

export type Args = {
  dmmf: BaseDMMF;
};

export const uuidv7Extension = (config: Args) => {
  const modelMap = getModelMap(config.dmmf.datamodel.models as DMMF.Model[]);
  return Prisma.defineExtension({
    query: {
      $allModels: {
        async $allOperations(params) {
          const { model, operation, args, query } = params;
          if (
            operation === "create" ||
            operation === "update" ||
            operation === "createMany" ||
            operation === "updateMany"
          ) {
            console.log({
              msg: `Updating fields for ${operation} on ${model}`,
            });
            if (
              typeof args.data === "object" &&
              args.data &&
              Array.isArray(args.data)
            ) {
              // @ts-expect-error First pass, fix typing
              args.data = args.data.map((item) => {
                return updateCreateFields(modelMap)({
                  operation,
                  model: modelMap[model],
                  // @ts-expect-error First pass, fix typing
                  data: item,
                });
              });
            } else {
              // @ts-expect-error First pass, fix typing
              args.data = updateCreateFields(modelMap)({
                operation,
                model: modelMap[model],
                // @ts-expect-error First pass, fix typing
                data: args.data,
              });
            }
          } else if (operation === "upsert") {
            // @ts-expect-error First pass, fix typing
            args.update = updateCreateFields(modelMap)({
              operation: "update",
              model: modelMap[model],
              // @ts-expect-error First pass, fix typing
              data: args.update,
            });
            args.create = updateCreateFields(modelMap)({
              operation: "create",
              model: modelMap[model],
              // @ts-expect-error First pass, fix typing
              data: args.create,
            }) as any;
          }

          return query(args);
        },
      },
    },
  });
};
