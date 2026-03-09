import { BathroomCreateInput } from "@/lib/validations/bathroom";

export interface AddRestroomMockResult {
  submissionId: string;
  submittedAt: string;
  payload: BathroomCreateInput;
  storage: "mock";
}

export const submitAddRestroomMock = async (
  payload: BathroomCreateInput
): Promise<AddRestroomMockResult> => {
  await new Promise((resolve) => setTimeout(resolve, 350));

  return {
    submissionId: `mock_${Date.now()}`,
    submittedAt: new Date().toISOString(),
    payload,
    storage: "mock"
  };
};
