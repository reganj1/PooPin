export interface ApiErrorResponse {
  error: string;
}

export type ApiFieldErrors = Record<string, string[] | undefined>;

export interface ApiValidationErrorResponse extends ApiErrorResponse {
  fieldErrors: ApiFieldErrors;
}
