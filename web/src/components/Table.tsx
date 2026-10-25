import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-borde bg-superficie">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-papel-50 text-left text-xs uppercase tracking-wide text-tinta-600">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b border-borde px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ className, onClick, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      onClick={onClick}
      className={cx(
        'border-b border-borde last:border-0',
        onClick && 'cursor-pointer hover:bg-papel-50',
        className,
      )}
    />
  );
}

export function Td({
  className,
  num,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <td {...rest} className={cx('px-3 py-2', num && 'num text-right', className)} />;
}
