use std::{fs, io::Write, path::{Path, PathBuf}, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, SubmenuBuilder};

const LIMIT: u64 = 24 * 1024 * 1024;
struct StorageLock(Mutex<()>);
struct ExitState(AtomicBool);
// Same directory lock as the npm CLI. Native writers additionally retain the
// OS file lock used by earlier builds. A crashed writer's empty directory is
// never stolen automatically; CLI users must run a compatible desktop build.
struct DirectoryLock(PathBuf);
impl DirectoryLock {
    fn acquire(path: &Path) -> Result<Self, String> {
        let started = std::time::Instant::now();
        loop {
            match fs::create_dir(path) {
                Ok(()) => return Ok(Self(path.to_path_buf())),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists && started.elapsed().as_secs() < 5 => std::thread::sleep(std::time::Duration::from_millis(50)),
                Err(error) => return Err(format!("No se pudo bloquear el espacio: {error}. Comprueba si hay otro escritor activo antes de retirar {}.", path.display())),
            }
        }
    }
}
impl Drop for DirectoryLock {
    fn drop(&mut self) { let _ = fs::remove_dir(&self.0); }
}
#[derive(Deserialize)]
struct ContextDocument { id: String, markdown: String }
#[derive(Deserialize)]
struct ContextExport { index: Value, documents: Vec<ContextDocument> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct SaveResult { revision: u64, path: String, context_error: Option<String> }

fn data_path(app: &tauri::AppHandle) -> Result<PathBuf,String> { app.path().app_data_dir().map_err(|e|e.to_string()) }
fn read_json(path:&Path)->Result<Option<Value>,String>{
    if !path.exists(){return Ok(None)}
    if fs::metadata(path).map_err(|e|e.to_string())?.len()>LIMIT{return Err("El archivo excede el límite de 24 MiB.".into())}
    let bytes=fs::read(path).map_err(|e|e.to_string())?;
    serde_json::from_slice(&bytes).map(Some).map_err(|e|format!("No se pudo leer el espacio. Se conserva el archivo original: {e}"))
}
fn atomic_write(path:&Path,bytes:&[u8])->Result<(),String>{
    let parent=path.parent().ok_or("Ruta inválida")?;
    fs::create_dir_all(parent).map_err(|e|e.to_string())?;
    let temp=path.with_extension("pending");
    let mut file=fs::File::create(&temp).map_err(|e|e.to_string())?;
    file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
    fs::rename(temp,path).map_err(|e|e.to_string())?;
    Ok(())
}
fn validate(value:&Value)->Result<(),String>{
    if value["schemaVersion"].as_u64()!=Some(1)||!value["items"].is_array()||!value["relations"].is_array()||!value["settings"].is_object(){return Err("El espacio no es compatible.".into())}
    Ok(())
}
fn write_workspace(path:&Path,mut workspace:Value,expected:u64)->Result<u64,String>{
    validate(&workspace)?;
    let current=read_json(path)?;
    let actual=current.as_ref().and_then(|v|v["revision"].as_u64()).unwrap_or(0);
    if actual!=expected{return Err(format!("El espacio cambió en otra instancia (revisión {actual}). Exporta una copia antes de recargar."))}
    let next=actual+1;workspace["revision"]=next.into();
    let bytes=serde_json::to_vec_pretty(&workspace).map_err(|e|e.to_string())?;
    if bytes.len() as u64>LIMIT{return Err("El espacio excede 24 MiB. Exporta y archiva el trabajo que ya no uses.".into())}
    if let Some(previous)=current { atomic_write(&path.with_file_name("workspace.previous.json"),&serde_json::to_vec_pretty(&previous).map_err(|e|e.to_string())?)?; }
    atomic_write(path,&bytes)?;Ok(next)
}
fn write_context(root:&Path,context:ContextExport,revision:u64)->Result<(),String>{
    let folder=root.join("context");
    for doc in context.documents {
        if doc.id.is_empty()||doc.id.len()>80||!doc.id.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'||c==b'_'){return Err("Identificador documental inválido".into())}
        atomic_write(&folder.join(format!("{}.md",doc.id)),doc.markdown.as_bytes())?;
    }
    let mut index=context.index;index["workspaceRevision"]=revision.into();
    atomic_write(&folder.join("index.json"),&serde_json::to_vec_pretty(&index).map_err(|e|e.to_string())?)
}
#[tauri::command]
fn load_workspace(app:tauri::AppHandle)->Result<Option<Value>,String>{read_json(&data_path(&app)?.join("workspace.json"))}
#[tauri::command]
fn storage_path(app:tauri::AppHandle)->Result<String,String>{Ok(data_path(&app)?.to_string_lossy().into_owned())}
#[tauri::command]
fn save_workspace(app:tauri::AppHandle,state:tauri::State<StorageLock>,workspace:Value,expected_revision:u64,context:ContextExport)->Result<SaveResult,String>{
    let _lock=state.0.lock().map_err(|e|e.to_string())?;
    let root=data_path(&app)?;fs::create_dir_all(&root).map_err(|e|e.to_string())?;
    let _directory_lock = DirectoryLock::acquire(&root.join("workspace.json.write-lock"))?;
    let lock=fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(root.join("workspace.lock")).map_err(|e|e.to_string())?;
    lock.lock().map_err(|e|e.to_string())?;
    let path=root.join("workspace.json");
    let revision=write_workspace(&path,workspace,expected_revision)?;
    let context_error=write_context(&root,context,revision).err();
    Ok(SaveResult{revision,path:path.to_string_lossy().into_owned(),context_error})
}
#[tauri::command]
fn export_workspace(path:String,workspace:Value)->Result<(),String>{validate(&workspace)?;atomic_write(Path::new(&path),&serde_json::to_vec_pretty(&workspace).map_err(|e|e.to_string())?)}
#[tauri::command]
fn import_workspace(path:String)->Result<Value,String>{let value=read_json(Path::new(&path))?.ok_or("No se encontró el archivo.")?;validate(&value)?;Ok(value)}

#[tauri::command]
fn export_text(path:String,body:String)->Result<(),String>{atomic_write(Path::new(&path),body.as_bytes())}

#[tauri::command]
fn exit_app(app:tauri::AppHandle,state:tauri::State<ExitState>){state.0.store(true,Ordering::SeqCst);app.exit(0);}

pub fn run(){
    tauri::Builder::default()
      .manage(StorageLock(Mutex::new(())))
      .manage(ExitState(AtomicBool::new(false)))
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_kairo::init())
      .invoke_handler(tauri::generate_handler![load_workspace,save_workspace,storage_path,export_workspace,import_workspace,export_text,exit_app])
      .setup(|app|{
        let settings=MenuItem::with_id(app,"settings","Configuración…",true,Some("CmdOrCtrl+,"))?;
        let new=MenuItem::with_id(app,"new","Nueva tarjeta",true,Some("CmdOrCtrl+N"))?;
        let search=MenuItem::with_id(app,"search","Buscar",true,Some("CmdOrCtrl+F"))?;
        let export=MenuItem::with_id(app,"export","Exportar espacio…",true,Some("CmdOrCtrl+Shift+E"))?;
        let import=MenuItem::with_id(app,"import","Importar espacio…",true,None::<&str>)?;
        let sidebar=MenuItem::with_id(app,"sidebar","Mostrar/ocultar barra lateral",true,Some("CmdOrCtrl+Shift+L"))?;
        let zoom_in=MenuItem::with_id(app,"zoom-in","Acercar",true,Some("CmdOrCtrl+Equal"))?;
        let zoom_out=MenuItem::with_id(app,"zoom-out","Alejar",true,Some("CmdOrCtrl+Minus"))?;
        let zoom_reset=MenuItem::with_id(app,"zoom-reset","Tamaño real (100 %)",true,Some("CmdOrCtrl+0"))?;
        let application=SubmenuBuilder::new(app,"Codaru Planning").item(&settings).separator().hide().hide_others().show_all().separator().quit().build()?;
        let file=SubmenuBuilder::new(app,"Archivo").item(&new).separator().item(&export).item(&import).close_window().build()?;
        let edit=SubmenuBuilder::new(app,"Edición").undo().redo().separator().cut().copy().paste().select_all().separator().item(&search).build()?;
        let view=SubmenuBuilder::new(app,"Visualización").item(&sidebar).separator().item(&zoom_in).item(&zoom_out).item(&zoom_reset).separator().fullscreen().build()?;
        let window=SubmenuBuilder::new(app,"Ventana").minimize().maximize().build()?;
        app.set_menu(Menu::with_items(app,&[&application,&file,&edit,&view,&window])?)?;
        app.on_menu_event(|app,event|{let _=app.emit("app-menu",event.id().as_ref());});
        Ok(())
      })
      .build(tauri::generate_context!()).expect("No se pudo iniciar Codaru Planning")
      .run(|app,event|{
        if let tauri::RunEvent::ExitRequested{api,..}=event {
          if !app.state::<ExitState>().0.load(Ordering::SeqCst)&&app.get_webview_window("main").is_some(){api.prevent_exit();let _=app.emit("app-quit",());}
        }
      });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shares_directory_lock_with_cli_and_releases_on_drop(){
        let dir=std::env::temp_dir().join(format!("planning-lock-test-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path=dir.join("workspace.json.write-lock");
        let guard=DirectoryLock::acquire(&path).unwrap();
        assert_eq!(fs::create_dir(&path).unwrap_err().kind(),std::io::ErrorKind::AlreadyExists);
        drop(guard);
        assert!(!path.exists());
        fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn protects_against_stale_writer_and_keeps_backup(){
        let dir=std::env::temp_dir().join(format!("planning-test-{}",std::process::id()));
        fs::create_dir_all(&dir).unwrap();let path=dir.join("workspace.json");
        let sample=serde_json::json!({"schemaVersion":1,"items":[],"relations":[],"settings":{},"revision":0});
        assert_eq!(write_workspace(&path,sample.clone(),0).unwrap(),1);
        assert!(write_workspace(&path,sample.clone(),0).is_err());
        assert_eq!(write_workspace(&path,sample,1).unwrap(),2);
        assert_eq!(read_json(&dir.join("workspace.previous.json")).unwrap().unwrap()["revision"],1);
        fs::remove_dir_all(dir).unwrap();
    }
}
