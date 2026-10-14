export type CommerceFranchise = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  isActive: boolean;
};

export type CommerceFranchisesResult =
  | { status: "available"; franchises: CommerceFranchise[] }
  | { status: "error"; message: string };
