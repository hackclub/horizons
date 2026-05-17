import { IsUrl, ValidationOptions } from 'class-validator';

export const CDN_ALLOWED_HOSTS = ['cdn.hackclub.com'];

export function IsCdnUrl(validationOptions?: ValidationOptions) {
  return IsUrl(
    {
      protocols: ['https'],
      require_protocol: true,
      host_whitelist: CDN_ALLOWED_HOSTS,
    },
    {
      message: `must be a Hack Club CDN URL (https://${CDN_ALLOWED_HOSTS[0]}/...)`,
      ...validationOptions,
    },
  );
}
