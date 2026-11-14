FROM php:8.3-fpm-alpine

COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_pgsql intl bcmath zip gd

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# Dependencies live outside the bind-mounted source so the host tree stays clean.
ENV COMPOSER_VENDOR_DIR=/opt/vendor \
    APP_VENDOR_DIR=/opt/vendor \
    APP_RUNTIME_PATH=/var/runtime/simrs

WORKDIR /opt/build
COPY composer.json composer.lock ./
RUN composer install --no-interaction --no-progress --prefer-dist --no-dev --optimize-autoloader \
    && rm -rf /root/.composer /tmp/*

RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && mkdir -p "$APP_RUNTIME_PATH" && chmod 777 "$APP_RUNTIME_PATH"
COPY docker/php-fpm-env.conf /usr/local/etc/php-fpm.d/zz-env.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/html
COPY . /var/www/html

ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]
