export interface CustomSelectOption<Value extends string = string> {
  value: Value;
  label: string;
}

export interface CustomSelectProps<Value extends string = string> {
  id: string;
  name: string;
  value: Value;
  options: readonly CustomSelectOption<Value>[];
  onValueChange: (value: Value) => void;
  disabled?: boolean;
}
