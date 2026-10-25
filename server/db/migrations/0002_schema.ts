import { sql, type Kysely } from 'kysely';

/* Modelo de datos mínimo (sección 8). Montos NUMERIC(12,2), stock INTEGER, fechas TIMESTAMPTZ. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE TABLE caja (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      establecimiento TEXT NOT NULL DEFAULT 'M001',
      punto_venta TEXT NOT NULL DEFAULT 'P001',
      activa BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE usuario (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('CAJERO', 'ADMIN')),
      caja_id UUID REFERENCES caja(id),
      activo BOOLEAN NOT NULL DEFAULT true,
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      bloqueado BOOLEAN NOT NULL DEFAULT false,
      bloqueado_hasta TIMESTAMPTZ,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE turno_caja (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      caja_id UUID NOT NULL REFERENCES caja(id),
      cajero_id UUID NOT NULL REFERENCES usuario(id),
      apertura_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      cierre_at TIMESTAMPTZ,
      fondo_inicial NUMERIC(12,2) NOT NULL CHECK (fondo_inicial >= 0),
      efectivo_contado NUMERIC(12,2),
      estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
      numero_corte INTEGER,
      corte JSONB
    );
    CREATE UNIQUE INDEX turno_abierto_por_caja ON turno_caja (caja_id) WHERE estado = 'ABIERTA';

    CREATE TABLE padron_nrc (
      nrc TEXT PRIMARY KEY,
      razon_social TEXT NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE cliente (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nit TEXT,
      nrc TEXT,
      dui TEXT,
      razon_social TEXT NOT NULL,
      nombre_comercial TEXT,
      giro TEXT,
      tipo_contribuyente TEXT NOT NULL CHECK (tipo_contribuyente IN ('GRANDE', 'NORMAL', 'CONSUMIDOR_FINAL')),
      departamento TEXT,
      municipio TEXT,
      direccion TEXT,
      telefono TEXT,
      correo TEXT,
      activo BOOLEAN NOT NULL DEFAULT true,
      es_consumidor_final_generico BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      busqueda TEXT GENERATED ALWAYS AS (
        lower(razon_social || ' ' || coalesce(nombre_comercial, '')) || ' ' ||
        regexp_replace(coalesce(nit, '') || ' ' || coalesce(nrc, '') || ' ' || coalesce(dui, ''), '[^0-9 ]', '', 'g')
      ) STORED
    );
    CREATE INDEX cliente_busqueda_trgm ON cliente USING gin (busqueda gin_trgm_ops);
    CREATE UNIQUE INDEX cliente_nit_unico ON cliente (nit) WHERE nit IS NOT NULL;

    CREATE TABLE proveedor (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      nit TEXT
    );

    CREATE TABLE producto (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku TEXT NOT NULL,
      codigo_barras TEXT,
      nombre TEXT NOT NULL,
      categoria TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'bien' CHECK (tipo IN ('bien', 'servicio')),
      costo_promedio NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0),
      precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
      activo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX producto_sku_unico ON producto (sku);
    CREATE INDEX producto_nombre_trgm ON producto USING gin (lower(nombre) gin_trgm_ops);

    CREATE TABLE lote_ingreso (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proveedor_id UUID NOT NULL REFERENCES proveedor(id),
      producto_id UUID NOT NULL REFERENCES producto(id),
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      costo_unitario NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
      factura_proveedor TEXT NOT NULL,
      fecha_recepcion DATE NOT NULL,
      costo_promedio_anterior NUMERIC(12,2) NOT NULL,
      costo_promedio_nuevo NUMERIC(12,2) NOT NULL,
      stock_anterior INTEGER NOT NULL,
      usuario_id UUID NOT NULL REFERENCES usuario(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE venta (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      turno_id UUID NOT NULL REFERENCES turno_caja(id),
      cliente_id UUID REFERENCES cliente(id),
      metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA')),
      efectivo_recibido NUMERIC(12,2),
      vuelto NUMERIC(12,2),
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE lote_contingencia (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      estado TEXT NOT NULL CHECK (estado IN ('ENVIADO', 'PROCESADO', 'FALLIDO')),
      documentos INTEGER NOT NULL,
      json JSONB NOT NULL,
      respuesta JSONB,
      origen TEXT NOT NULL DEFAULT 'WORKER'
    );

    CREATE TABLE dte (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo TEXT NOT NULL CHECK (tipo IN ('01', '03', '05')),
      numero_control TEXT NOT NULL UNIQUE,
      codigo_generacion TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL CHECK (estado IN ('BORRADOR','FIRMADO','ENCOLADO','TRANSMITIDO','PROCESADO','RECHAZADO','INVALIDADO')),
      venta_id UUID REFERENCES venta(id),
      turno_id UUID REFERENCES turno_caja(id),
      cliente_id UUID REFERENCES cliente(id),
      receptor JSONB NOT NULL,
      referenced_dte_id UUID REFERENCES dte(id),
      corrige_dte_id UUID REFERENCES dte(id),
      json_original JSONB,
      jws TEXT,
      sello_recepcion TEXT,
      fh_procesamiento TIMESTAMPTZ,
      respuesta_mh JSONB,
      gravado NUMERIC(12,2) NOT NULL,
      iva NUMERIC(12,2) NOT NULL,
      retencion NUMERIC(12,2) NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      emitido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      procesado_at TIMESTAMPTZ,
      intentos_transmision INTEGER NOT NULL DEFAULT 0,
      pipeline_ms INTEGER,
      lote_id UUID REFERENCES lote_contingencia(id),
      emitido_por UUID REFERENCES usuario(id)
    );
    CREATE INDEX dte_estado ON dte (estado);
    CREATE INDEX dte_emitido_at ON dte (emitido_at DESC);
    CREATE INDEX dte_cliente ON dte (cliente_id);
    CREATE INDEX dte_referenced ON dte (referenced_dte_id);

    CREATE TABLE dte_linea (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dte_id UUID NOT NULL REFERENCES dte(id),
      num_item INTEGER NOT NULL,
      producto_id UUID REFERENCES producto(id),
      linea_original_id UUID REFERENCES dte_linea(id),
      codigo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      tipo_item TEXT NOT NULL DEFAULT 'bien',
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      precio_unitario NUMERIC(12,2) NOT NULL,
      gravado NUMERIC(12,2) NOT NULL
    );

    CREATE TABLE dte_event (
      id BIGSERIAL PRIMARY KEY,
      dte_id UUID NOT NULL REFERENCES dte(id),
      estado_origen TEXT,
      estado_destino TEXT NOT NULL,
      actor TEXT NOT NULL,
      motivo TEXT,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX dte_event_dte ON dte_event (dte_id, id);

    CREATE TABLE motivo_invalidacion (
      id INTEGER PRIMARY KEY,
      descripcion TEXT NOT NULL,
      requiere_observaciones BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE evento_invalidacion (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dte_id UUID NOT NULL UNIQUE REFERENCES dte(id),
      codigo_generacion TEXT NOT NULL UNIQUE,
      motivo_id INTEGER NOT NULL REFERENCES motivo_invalidacion(id),
      responsable_id UUID NOT NULL REFERENCES usuario(id),
      observaciones TEXT,
      json JSONB NOT NULL,
      jws TEXT NOT NULL,
      sello TEXT,
      respuesta_mh JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE movimiento_inventario (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      producto_id UUID NOT NULL REFERENCES producto(id),
      tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO', 'VENTA', 'DEVOLUCION', 'REVERSION_INVALIDACION', 'AJUSTE')),
      cantidad INTEGER NOT NULL,
      costo NUMERIC(12,2),
      referencia_dte_id UUID REFERENCES dte(id),
      referencia_lote_id UUID REFERENCES lote_ingreso(id),
      saldo_resultante INTEGER NOT NULL,
      usuario_id UUID REFERENCES usuario(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX movimiento_producto ON movimiento_inventario (producto_id, created_at);

    CREATE TABLE mh_exchange (
      id BIGSERIAL PRIMARY KEY,
      direccion TEXT NOT NULL DEFAULT 'SALIDA',
      endpoint TEXT NOT NULL,
      dte_id UUID REFERENCES dte(id),
      lote_id UUID REFERENCES lote_contingencia(id),
      request JSONB,
      response JSONB,
      http_status INTEGER,
      resultado TEXT NOT NULL,
      latencia_ms INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE correo_simulado (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dte_id UUID REFERENCES dte(id),
      destinatario TEXT NOT NULL,
      asunto TEXT NOT NULL,
      cuerpo TEXT NOT NULL,
      adjuntos JSONB NOT NULL DEFAULT '[]',
      enviado_por UUID REFERENCES usuario(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_log (
      id BIGSERIAL PRIMARY KEY,
      usuario_id UUID REFERENCES usuario(id),
      accion TEXT NOT NULL,
      entidad TEXT,
      entidad_id TEXT,
      detalle JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );

    CREATE TABLE contador_numeracion (
      tipo TEXT PRIMARY KEY,
      ultimo BIGINT NOT NULL DEFAULT 0
    );
    INSERT INTO contador_numeracion (tipo) VALUES ('01'), ('03'), ('05'), ('CORTE_Z');

    -- Bitácoras de solo inserción: UPDATE y DELETE se rechazan.
    -- (El restablecimiento de la demostración usa TRUNCATE, que no dispara triggers por fila.)
    CREATE FUNCTION rechazar_mutacion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
    END $$;
    CREATE TRIGGER dte_event_inmutable BEFORE UPDATE OR DELETE ON dte_event
      FOR EACH ROW EXECUTE FUNCTION rechazar_mutacion();
    CREATE TRIGGER audit_log_inmutable BEFORE UPDATE OR DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION rechazar_mutacion();

    -- RNF-NCE-01: la referencia al DTE original no cambia una vez escrita.
    CREATE FUNCTION referencia_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.referenced_dte_id IS DISTINCT FROM OLD.referenced_dte_id THEN
        RAISE EXCEPTION 'referenced_dte_id es inmutable' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER dte_referencia_inmutable BEFORE UPDATE ON dte
      FOR EACH ROW EXECUTE FUNCTION referencia_inmutable();
  `.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS contador_numeracion, audit_log, correo_simulado, mh_exchange, movimiento_inventario,
      evento_invalidacion, motivo_invalidacion, dte_event, dte_linea, dte, lote_contingencia, venta,
      lote_ingreso, producto, proveedor, cliente, padron_nrc, turno_caja, usuario, caja CASCADE;
    DROP FUNCTION IF EXISTS rechazar_mutacion, referencia_inmutable;
  `.execute(db);
}
