<?php

declare(strict_types=1);

namespace Wayfairs\Core;

final class Money
{
    public static function parse(string $value, int $scale): int
    {
        $value = trim($value);
        if ($scale < 0 || $scale > 18 || !preg_match('/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/', $value, $matches)) {
            throw new \InvalidArgumentException('Enter a valid positive amount.');
        }
        $fraction = $matches[2] ?? '';
        if (strlen($fraction) > $scale) {
            throw new \InvalidArgumentException('Amount has too many decimal places.');
        }
        $digits = ltrim($matches[1] . str_pad($fraction, $scale, '0'), '0');
        $digits = $digits === '' ? '0' : $digits;
        if (strlen($digits) > 18 || (strlen($digits) === 18 && strcmp($digits, (string) PHP_INT_MAX) > 0)) {
            throw new \InvalidArgumentException('Amount is too large.');
        }
        return (int) $digits;
    }

    public static function format(int|string $minor, int $scale, string $symbol = '', string $code = ''): string
    {
        $negative = (int) $minor < 0;
        $digits = ltrim((string) abs((int) $minor), '0');
        $digits = $digits === '' ? '0' : $digits;
        if ($scale > 0) {
            $digits = str_pad($digits, $scale + 1, '0', STR_PAD_LEFT);
            $value = substr($digits, 0, -$scale) . '.' . substr($digits, -$scale);
        } else {
            $value = $digits;
        }
        return ($negative ? '-' : '') . $symbol . $value . ($code !== '' ? ' ' . $code : '');
    }
}
