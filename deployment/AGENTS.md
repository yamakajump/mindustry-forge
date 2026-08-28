# The production server

```bash
ssh <server> "bash /var/www/mindustry-forge/deployment/deploy.sh"
```

## The repository is the truth

This directory holds the nginx vhost, the PHP-FPM pool and the systemd units, and
`deploy.sh` copies them onto the server on every pass.

**Never edit the nginx site file or the PHP-FPM pool over SSH.** They are
`/etc/nginx/sites-available/mindustryforge` and `/etc/php/8.3/fpm/pool.d/mforge.conf` on
the machine, and the next deployment overwrites both, silently. Edit the file here instead.

`install-server.sh` rebuilds the machine from nothing. Keeping it current is what makes a
hardware failure recoverable without depending on somebody's memory of what was typed by
hand on the day the site went up.

## Sharing the machine

The server hosts other applications, business ones included, under other accounts. A public
site open to anyone does not belong under the same account as those, so this one has its own
system user, its own PHP-FPM pool and socket, and its own database, and shares nothing with
them.

That is also why a failed deployment must not take the neighbours down with it: `deploy.sh`
puts the previous vhost back when `nginx -t` refuses the new one, and brings the site out
of maintenance rather than leaving a white page.

Adding or renaming a PHP-FPM pool needs a `systemctl restart`, not a `reload`: a reload
reuses inherited sockets, so the new pool never appears, and nothing reports an error. The
restart briefly cuts the other sites served by the same PHP-FPM, which is why `deploy.sh`
only does it when the pool file has actually changed.
